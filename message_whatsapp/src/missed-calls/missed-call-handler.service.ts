import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { MissedCallEvent } from './entities/missed-call-event.entity';
import { CommercialActionTask } from 'src/action-queue/entities/commercial-action-task.entity';
import { ActionQueueService } from 'src/action-queue/action-queue.service';
import { normalizePhone } from 'src/shared/utils/normalize-phone';
import {
  INBOUND_MESSAGE_PROCESSED_EVENT,
  InboundMessageProcessedEvent,
} from 'src/ingress/events/inbound-message-processed.event';

const MISSED_CALL_SLA_MINUTES = 30;

export interface HandleMissedCallParams {
  source: 'whatsapp' | 'db2';
  externalId: string;
  clientPhone: string;
  posteId?: string | null;
  commercialId?: string | null;
  deviceId?: string | null;
  occurredAt: Date;
  clientName?: string | null;
}

export interface OutgoingCallParams {
  callEventExternalId: string;
  posteId: string;
  commercialId: string;
  clientPhone: string;
  occurredAt: Date;
  durationSeconds: number | null;
}

@Injectable()
export class MissedCallHandlerService {
  private readonly logger = new Logger(MissedCallHandlerService.name);

  constructor(
    @InjectRepository(MissedCallEvent)
    private readonly missedCallRepo: Repository<MissedCallEvent>,

    @InjectRepository(CommercialActionTask)
    private readonly actionTaskRepo: Repository<CommercialActionTask>,

    private readonly actionQueueService: ActionQueueService,

    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Listener : webhook WhatsApp ──────────────────────────────────────────

  @OnEvent(INBOUND_MESSAGE_PROCESSED_EVENT, { async: true })
  async onInboundMessageProcessed(event: InboundMessageProcessedEvent): Promise<void> {
    if (event.message.type !== 'missed_call') return;

    const chat        = event.conversation;
    const message     = event.message;
    const clientPhone = normalizePhone(message.from ?? message.chat_id);
    const externalId  = message.external_id ?? message.message_id ?? message.id;

    if (!clientPhone || !externalId) {
      this.logger.warn(
        `MISSED_CALL_SKIPPED: clientPhone ou externalId manquant (msg.id=${message.id})`,
      );
      return;
    }

    await this.handle({
      source:       'whatsapp',
      externalId,
      clientPhone,
      posteId:      chat.poste_id ?? null,
      commercialId: null, // commercial résolu plus tard si besoin
      occurredAt:   message.timestamp ?? new Date(),
      clientName:   message.from_name ?? chat.name ?? null,
    }).catch((err: Error) =>
      this.logger.error(
        `MISSED_CALL_HANDLER_ERROR (whatsapp) externalId=${externalId}: ${err.message}`,
      ),
    );
  }

  // ── Traitement central ───────────────────────────────────────────────────

  async handle(params: HandleMissedCallParams): Promise<void> {
    const normalizedPhone = normalizePhone(params.clientPhone);

    // Idempotence : INSERT IGNORE via orIgnore()
    const existing = await this.missedCallRepo.findOne({
      where: { externalId: params.externalId },
      select: ['id', 'status'],
    });

    if (existing) {
      this.logger.debug(
        `MISSED_CALL_DUPLICATE externalId=${params.externalId} — ignoré (status=${existing.status})`,
      );
      return;
    }

    // Créer l'événement d'appel en absence
    const missed = this.missedCallRepo.create({
      id:           uuidv4(),
      source:       params.source,
      externalId:   params.externalId,
      occurredAt:   params.occurredAt,
      clientPhone:  normalizedPhone || params.clientPhone,
      clientName:   params.clientName ?? null,
      posteId:      params.posteId ?? null,
      commercialId: params.commercialId ?? null,
      deviceId:     params.deviceId ?? null,
      status:       'pending',
    });

    await this.missedCallRepo.save(missed);

    this.logger.log(
      `MISSED_CALL_CREATED id=${missed.id} source=${params.source} phone=${missed.clientPhone} posteId=${missed.posteId ?? 'none'}`,
    );

    // Créer la tâche de rappel si on a un poste ou un commercial assigné
    if (params.posteId || params.commercialId) {
      await this.createCallbackTask(missed);
    }
  }

  // ── Création de la tâche de rappel ───────────────────────────────────────

  private async createCallbackTask(missed: MissedCallEvent): Promise<void> {
    const dueAt = new Date(Date.now() + MISSED_CALL_SLA_MINUTES * 60_000);

    try {
      const task = await this.actionQueueService.saveTask({
        source:        'missed_call',
        entityId:      missed.externalId,
        commercialId:  missed.commercialId ?? '',
        posteId:       missed.posteId,
        contactPhone:  missed.clientPhone,
        contactName:   missed.clientName ?? undefined,
        status:        'pending',
        dueAt,
        notes:         `Appel manqué le ${missed.occurredAt.toLocaleString('fr-FR')}`,
      });

      await this.missedCallRepo.update(missed.id, {
        callbackTaskId: task.id,
        status:         'assigned',
      });

      this.logger.log(
        `MISSED_CALL_TASK_CREATED missedId=${missed.id} taskId=${task.id} dueAt=${dueAt.toISOString()}`,
      );
    } catch (err) {
      this.logger.error(
        `MISSED_CALL_TASK_CREATION_FAILED missedId=${missed.id}: ${(err as Error).message}`,
      );
    }
  }

  // ── Détection rappel sortant ─────────────────────────────────────────────

  async onOutgoingCallDetected(params: OutgoingCallParams): Promise<boolean> {
    const normalizedPhone = normalizePhone(params.clientPhone);

    const missed = await this.missedCallRepo.findOne({
      where: {
        clientPhone: normalizedPhone || params.clientPhone,
        posteId:     params.posteId,
        status:      In(['pending', 'assigned'] as const),
        occurredAt:  LessThan(params.occurredAt),
      },
      order: { occurredAt: 'DESC' },
    });

    if (!missed) return false;

    const handlingDelaySeconds = Math.round(
      (params.occurredAt.getTime() - missed.occurredAt.getTime()) / 1000,
    );

    await this.missedCallRepo.update(missed.id, {
      status:                   'called_back',
      callbackDoneAt:           params.occurredAt,
      callbackCallEventId:      params.callEventExternalId,
      callbackDurationSeconds:  params.durationSeconds,
      handlingDelaySeconds,
    });

    if (missed.callbackTaskId) {
      await this.actionTaskRepo.update(missed.callbackTaskId, { status: 'done' });
    }

    this.logger.log(
      `MISSED_CALL_CLOSED missedId=${missed.id} clientPhone=${params.clientPhone} ` +
      `posteId=${params.posteId} delay=${handlingDelaySeconds}s`,
    );

    this.eventEmitter.emit('missed_call.called_back', {
      missedCallId:         missed.id,
      posteId:              params.posteId,
      commercialId:         params.commercialId,
      clientPhone:          params.clientPhone,
      handlingDelaySeconds,
    });

    return true;
  }
}
