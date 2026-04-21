import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationValidation } from '../entities/conversation-validation.entity';
import { ValidationCriterionConfig } from '../entities/validation-criterion-config.entity';
import { WhatsappChat, WindowStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

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
  validated: number;
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
   * Initialise les enregistrements de validation pour une conversation.
   * Appelé quand une conversation entre dans la fenêtre active.
   */
  async initConversationValidation(chatId: string): Promise<void> {
    const criteria = await this.getActiveCriteria();
    for (const c of criteria) {
      const exists = await this.validationRepo.findOne({
        where: { chat_id: chatId, criterion_type: c.criterion_type },
      });
      if (!exists) {
        await this.validationRepo.save(
          this.validationRepo.create({
            chat_id: chatId,
            criterion_type: c.criterion_type,
            is_validated: false,
            validated_at: null,
            external_id: null,
            external_data: null,
          }),
        );
      }
    }
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
   * Nombre de conversations actives validées pour un poste.
   * "Bloc en cours : X / 10"
   */
  async getBlockProgress(posteId: string): Promise<BlockProgress> {
    const activeChats = await this.chatRepo.find({
      where: { poste_id: posteId, window_status: WindowStatus.ACTIVE },
      select: ['chat_id'],
    });

    if (activeChats.length === 0) {
      const validatedChats = await this.chatRepo.find({
        where: { poste_id: posteId, window_status: WindowStatus.VALIDATED },
        select: ['chat_id'],
      });
      return { validated: validatedChats.length, total: validatedChats.length };
    }

    const allActive = await this.chatRepo.find({
      where: [
        { poste_id: posteId, window_status: WindowStatus.ACTIVE },
        { poste_id: posteId, window_status: WindowStatus.VALIDATED },
      ],
      select: ['chat_id', 'window_status'],
    });

    const total = allActive.length;
    const validated = allActive.filter((c) => c.window_status === WindowStatus.VALIDATED).length;
    return { validated, total };
  }
}
