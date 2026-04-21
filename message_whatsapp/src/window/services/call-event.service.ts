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
        client_phone: dto.client_phone,
        call_status: dto.call_status,
        duration_seconds: dto.duration_seconds ?? null,
        recording_url: dto.recording_url ?? null,
        order_id: dto.order_id ?? null,
        event_at: new Date(dto.event_at),
        chat_id: chat?.chat_id ?? null,
        commercial_id: null,
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
   * Corrèle un appel à la conversation active en cherchant le client par numéro
   * et le commercial par son canal associé.
   */
  private async correlateToChat(
    clientPhone: string,
    _commercialPhone: string,
  ): Promise<WhatsappChat | null> {
    const normalized = clientPhone.replace(/\D/g, '');

    const chat = await this.chatRepo
      .createQueryBuilder('c')
      .where(
        "(c.contact_client LIKE :phone OR c.contact_client LIKE :intl)",
        { phone: `%${normalized}`, intl: `%${normalized.replace(/^0/, '225')}` },
      )
      .andWhere('c.deletedAt IS NULL')
      .andWhere("c.status != 'fermé'")
      .orderBy('c.last_activity_at', 'DESC')
      .getOne();

    return chat ?? null;
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
