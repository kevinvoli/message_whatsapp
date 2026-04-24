import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallEvent } from '../entities/call-event.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ValidationEngineService } from './validation-engine.service';
import { WindowRotationService } from './window-rotation.service';

export interface CreateCallEventDto {
  external_id: string;
  event_at: string;
  commercial_phone: string;
  client_phone: string;
  call_status: string;
  duration_seconds?: number | null;
  recording_url?: string | null;
  order_id?: string | null;
  commercial_email?: string | null;
  commercial_id?: string | null;
}

@Injectable()
export class CallEventService {
  private readonly logger = new Logger(CallEventService.name);

  constructor(
    @InjectRepository(CallEvent)
    private readonly callEventRepo: Repository<CallEvent>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly validationEngine: ValidationEngineService,
    private readonly windowRotation: WindowRotationService,
  ) {}

  /**
   * Reçoit un événement d'appel depuis la plateforme externe.
   * Idempotent : un même external_id ne produit qu'un seul enregistrement.
   */
  async receiveCallEvent(dto: CreateCallEventDto): Promise<CallEvent> {
    const existing = await this.callEventRepo.findOne({
      where: { external_id: dto.external_id },
    });
    if (existing) {
      throw new ConflictException(`Événement ${dto.external_id} déjà traité`);
    }

    const chat = await this.correlateToChat(dto.client_phone, dto.commercial_phone);

    const callEvent = await this.callEventRepo.save(
      this.callEventRepo.create({
        external_id: dto.external_id,
        commercial_phone: dto.commercial_phone,
        commercial_email: dto.commercial_email ?? null,
        client_phone: dto.client_phone,
        call_status: dto.call_status,
        duration_seconds: dto.duration_seconds ?? null,
        recording_url: dto.recording_url ?? null,
        order_id: dto.order_id ?? null,
        event_at: new Date(dto.event_at),
        chat_id: chat?.chat_id ?? null,
        commercial_id: dto.commercial_id ?? null,
      }),
    );

    this.logger.log(
      `Événement appel reçu: ${dto.external_id} — ${dto.call_status} — corrélé à conv: ${chat?.chat_id ?? 'aucune'}`,
    );

    if (chat?.chat_id) {
      const isNew = await this.validationEngine.markCriterionMet(
        chat.chat_id,
        'call_confirmed',
        dto.external_id,
        {
          call_status: dto.call_status,
          duration_seconds: dto.duration_seconds,
          recording_url: dto.recording_url,
        },
      );

      if (isNew && chat.poste_id) {
        const state = await this.validationEngine.getValidationState(chat.chat_id);
        if (state.allRequiredMet) {
          await this.windowRotation.onConversationValidated(chat.chat_id, chat.poste_id);
        }
      }
    }

    return callEvent;
  }

  /**
   * Corrèle un appel à la conversation active :
   * - Exact match sur plusieurs variantes de numéro (local, international)
   * - Fallback LIKE sur les 8 derniers chiffres
   * - Priorise les conversations dans la fenêtre active (window_status active/validated)
   * - Restriction par commercial_phone si poste identifiable
   */
  private async correlateToChat(
    clientPhone: string,
    commercialPhone: string,
  ): Promise<WhatsappChat | null> {
    const clientNorm = clientPhone.replace(/\D/g, '');
    const { exact, suffix } = this.buildPhoneVariants(clientNorm);

    // Construire les clauses OR paramétrées (exact + LIKE séparés)
    const conditions: string[] = exact.map((_, i) => `c.contact_client = :e${i}`);
    const params: Record<string, string> = {};
    exact.forEach((v, i) => { params[`e${i}`] = v; });
    if (suffix) {
      conditions.push('c.contact_client LIKE :suffix');
      params['suffix'] = `%${suffix}`;
    }

    if (conditions.length === 0) return null;

    const buildBase = () =>
      this.chatRepo
        .createQueryBuilder('c')
        .where(`(${conditions.join(' OR ')})`, params)
        .andWhere('c.deletedAt IS NULL')
        .andWhere("c.status != 'fermé'")
        .orderBy(`CASE WHEN c.window_status IN ('active','validated') THEN 0 ELSE 1 END`, 'ASC')
        .addOrderBy('c.last_activity_at', 'DESC');

    // Essai restreint au poste du commercial
    if (commercialPhone) {
      const commNorm = commercialPhone.replace(/\D/g, '');
      if (commNorm.length >= 8) {
        const withPoste = await buildBase()
          .innerJoin('c.poste', 'p')
          .andWhere('p.phone LIKE :commPhone', { commPhone: `%${commNorm.slice(-8)}` })
          .getOne();
        if (withPoste) return withPoste;
      }
    }

    return buildBase().getOne() ?? null;
  }

  private buildPhoneVariants(normalized: string): { exact: string[]; suffix: string | null } {
    const exact = new Set<string>([normalized]);
    // 0XXXXXXXX → 225XXXXXXXX (Côte d'Ivoire)
    if (normalized.startsWith('0') && normalized.length >= 9) {
      exact.add('225' + normalized.slice(1));
    }
    // 225XXXXXXXX → 0XXXXXXXX
    if (normalized.startsWith('225') && normalized.length >= 11) {
      exact.add('0' + normalized.slice(3));
    }
    const suffix = normalized.length >= 8 ? normalized.slice(-8) : null;
    return { exact: [...exact], suffix };
  }

  /** Historique des appels (admin). */
  async findAll(limit = 50, offset = 0): Promise<[CallEvent[], number]> {
    return this.callEventRepo.findAndCount({
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
    });
  }
}
