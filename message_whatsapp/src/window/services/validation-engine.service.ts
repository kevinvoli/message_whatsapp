import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConversationValidation } from '../entities/conversation-validation.entity';
import { ValidationCriterionConfig } from '../entities/validation-criterion-config.entity';
import { WhatsappChat, WindowStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { ConversationReportService } from 'src/gicop-report/conversation-report.service';

export interface CriterionState {
  type: string;
  label: string;
  required: boolean;
  validated: boolean;
  validatedAt: Date | null;
}

export interface ConversationValidationState {
  criteria: CriterionState[];
  allRequiredMet: boolean;
}

export interface BlockProgress {
  submitted: number;
  total: number;
}

@Injectable()
export class ValidationEngineService {
  private readonly logger = new Logger(ValidationEngineService.name);

  constructor(
    @InjectRepository(ConversationValidation)
    private readonly validationRepo: Repository<ConversationValidation>,
    @InjectRepository(ValidationCriterionConfig)
    private readonly criterionRepo: Repository<ValidationCriterionConfig>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly systemConfig: SystemConfigService,
    private readonly reportService: ConversationReportService,
  ) {}

  async getActiveCriteria(): Promise<ValidationCriterionConfig[]> {
    return this.criterionRepo.find({
      where: { is_active: true },
      order: { sort_order: 'ASC' },
    });
  }

  async getValidationState(chatId: string): Promise<ConversationValidationState> {
    const [criteria, validations] = await Promise.all([
      this.getActiveCriteria(),
      this.validationRepo.find({ where: { chat_id: chatId } }),
    ]);

    return this.buildStateFromCriteriaAndValidations(criteria, validations);
  }

  /**
   * Charge les états de validation pour plusieurs conversations en 2 requêtes (bulk).
   * Remplace N appels à getValidationState().
   */
  async getValidationStatesBulk(
    chatIds: string[],
  ): Promise<Map<string, CriterionState[]>> {
    const result = new Map<string, CriterionState[]>();
    if (chatIds.length === 0) return result;

    const [criteria, allValidations] = await Promise.all([
      this.getActiveCriteria(),
      this.validationRepo
        .createQueryBuilder('v')
        .where('v.chat_id IN (:...chatIds)', { chatIds })
        .getMany(),
    ]);

    // Grouper les validations par chat_id
    const byChat = new Map<string, typeof allValidations>();
    for (const v of allValidations) {
      const list = byChat.get(v.chat_id) ?? [];
      list.push(v);
      byChat.set(v.chat_id, list);
    }

    for (const chatId of chatIds) {
      const validations = byChat.get(chatId) ?? [];
      const { criteria: states } = this.buildStateFromCriteriaAndValidations(criteria, validations);
      result.set(chatId, states);
    }

    return result;
  }

  private buildStateFromCriteriaAndValidations(
    criteria: ValidationCriterionConfig[],
    validations: ConversationValidation[],
  ): ConversationValidationState {
    const validationMap = new Map(validations.map((v) => [v.criterion_type, v]));

    const criteriaStates: CriterionState[] = criteria.map((c) => {
      const v = validationMap.get(c.criterion_type);
      return {
        type: c.criterion_type,
        label: c.label,
        required: c.is_required,
        validated: v?.is_validated ?? false,
        validatedAt: v?.validated_at ?? null,
      };
    });

    const allRequiredMet = criteriaStates
      .filter((c) => c.required)
      .every((c) => c.validated);

    return { criteria: criteriaStates, allRequiredMet };
  }

  /**
   * Marque un critère comme atteint pour une conversation (idempotent).
   * Retourne true si c'est une nouveauté (premier marquage).
   */
  async markCriterionMet(
    chatId: string,
    criterionType: string,
    externalId?: string,
    externalData?: Record<string, unknown>,
  ): Promise<boolean> {
    const existing = await this.validationRepo.findOne({
      where: { chat_id: chatId, criterion_type: criterionType },
    });

    if (existing?.is_validated) return false; // idempotent

    if (existing) {
      await this.validationRepo.update(
        { id: existing.id },
        {
          is_validated: true,
          validated_at: new Date(),
          external_id: externalId ?? existing.external_id,
          external_data: (externalData ?? existing.external_data) as any,
        },
      );
    } else {
      await this.validationRepo.save(
        this.validationRepo.create({
          chat_id: chatId,
          criterion_type: criterionType,
          is_validated: true,
          validated_at: new Date(),
          external_id: externalId ?? null,
          external_data: externalData ?? null,
        }),
      );
    }

    this.logger.log(`Critère ${criterionType} validé pour conv ${chatId}`);
    return true;
  }

  /**
   * Initialise les enregistrements de validation pour une conversation (bulk).
   * Vérifie les existants en une requête puis insère les manquants en une requête.
   */
  async initConversationValidation(chatId: string): Promise<void> {
    const criteria = await this.getActiveCriteria();
    if (criteria.length === 0) return;

    const existing = await this.validationRepo.find({
      where: { chat_id: chatId },
      select: ['criterion_type'],
    });
    const existingTypes = new Set(existing.map((e) => e.criterion_type));

    const toCreate = criteria
      .filter((c) => !existingTypes.has(c.criterion_type))
      .map((c) =>
        this.validationRepo.create({
          chat_id: chatId,
          criterion_type: c.criterion_type,
          is_validated: false,
          validated_at: null,
          external_id: null,
          external_data: null,
        }),
      );

    if (toCreate.length > 0) {
      await this.validationRepo.save(toCreate);
    }
  }

  /**
   * Initialise les validations pour plusieurs conversations en lot.
   * Réduit les aller-retours DB lors de la construction de la fenêtre.
   */
  async initConversationValidationBulk(chatIds: string[]): Promise<void> {
    if (chatIds.length === 0) return;
    await Promise.all(chatIds.map((id) => this.initConversationValidation(id)));
  }

  /**
   * Appelé quand conversation_result est renseigné.
   * Marque le critère 'result_set' comme validé.
   * Retourne true si le chat est maintenant pleinement validé.
   */
  async onConversationResultSet(chatId: string): Promise<boolean> {
    await this.markCriterionMet(chatId, 'result_set');
    const state = await this.getValidationState(chatId);
    return state.allRequiredMet;
  }

  /**
   * Nombre de rapports soumis dans le bloc actif du poste.
   * "Bloc en cours : X / 10"
   */
  async getBlockProgress(posteId: string): Promise<BlockProgress> {
    const activeChats = await this.chatRepo.find({
      where: { poste_id: posteId, window_status: WindowStatus.ACTIVE },
      select: ['chat_id'],
    });

    if (activeChats.length === 0) return { submitted: 0, total: 0 };

    const submittedMap = await this.reportService.getSubmittedMapBulk(
      activeChats.map((c) => c.chat_id),
    );
    const submitted = activeChats.filter((c) => submittedMap.get(c.chat_id) === true).length;
    return { submitted, total: activeChats.length };
  }

  /**
   * Cron toutes les heures : auto-valide le critère 'call_confirmed' pour les conversations
   * actives dont le délai sans réponse externe est dépassé.
   * Configurable via WINDOW_EXTERNAL_TIMEOUT_HOURS (0 = désactivé).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExternalCriterionTimeout(): Promise<void> {
    const raw = await this.systemConfig.get('WINDOW_EXTERNAL_TIMEOUT_HOURS');
    const hours = raw ? parseInt(raw, 10) : 0;
    if (hours <= 0) return;

    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Trouver les conversations actives dont call_confirmed n'est pas encore validé
    // et dont l'enregistrement est plus vieux que le délai configuré
    const pending = await this.validationRepo.find({
      where: {
        criterion_type: 'call_confirmed',
        is_validated: false,
        created_at: LessThan(cutoff),
      },
    });

    if (pending.length === 0) return;

    let autoValidated = 0;
    for (const v of pending) {
      const chat = await this.chatRepo.findOne({
        where: { chat_id: v.chat_id, window_status: WindowStatus.ACTIVE },
        select: ['id', 'chat_id'],
      });
      if (!chat) continue;

      await this.validationRepo.update(
        { id: v.id },
        {
          is_validated: true,
          validated_at: new Date(),
          external_id: 'auto_timeout',
          external_data: { reason: 'timeout', hours } as any,
        },
      );
      autoValidated++;
    }

    if (autoValidated > 0) {
      this.logger.log(
        `Auto-validation call_confirmed pour ${autoValidated} conversation(s) (timeout ${hours}h)`,
      );
    }
  }
}
