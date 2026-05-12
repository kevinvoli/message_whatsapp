import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { MissedCallEvent } from './entities/missed-call-event.entity';
import { CommercialActionTask } from 'src/action-queue/entities/commercial-action-task.entity';
import { CallEvent, CallStatus } from 'src/window/entities/call-event.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappMessage, MessageDirection } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ActionQueueService } from 'src/action-queue/action-queue.service';
import { normalizePhone } from 'src/shared/utils/normalize-phone';
import {
  INBOUND_MESSAGE_PROCESSED_EVENT,
  InboundMessageProcessedEvent,
} from 'src/ingress/events/inbound-message-processed.event';

const CALL_MSG_TYPES = ['call', 'voice_call', 'video_call', 'missed_call'];

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

    @InjectRepository(CallEvent)
    private readonly callEventRepo: Repository<CallEvent>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,

    @InjectRepository(WhatsappMessage)
    private readonly messageRepo: Repository<WhatsappMessage>,

    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,

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

  // ── Backfill messages WhatsApp → missed_call_event ──────────────────────

  async backfillFromWhatsappMessages(): Promise<{ processed: number; skipped: number; created: number }> {
    type MsgRow = {
      msgId: string;
      externalId: string | null;
      messageId: string | null;
      clientPhone: string;
      clientName: string;
      posteId: string | null;
      occurredAt: Date;
      unreadCount: number;
      contactClient: string;
    };

    const rows = await this.messageRepo
      .createQueryBuilder('m')
      .innerJoin('m.chat', 'c')
      .select('m.id', 'msgId')
      .addSelect('m.external_id', 'externalId')
      .addSelect('m.message_id', 'messageId')
      .addSelect('m.from', 'clientPhone')
      .addSelect('m.from_name', 'clientName')
      .addSelect('m.poste_id', 'posteId')
      .addSelect('m.timestamp', 'occurredAt')
      .addSelect('c.unread_count', 'unreadCount')
      .addSelect('c.contact_client', 'contactClient')
      .where('m.type IN (:...types)', { types: CALL_MSG_TYPES })
      .andWhere('m.direction = :dir', { dir: MessageDirection.IN })
      .andWhere('m.deletedAt IS NULL')
      .andWhere('c.deletedAt IS NULL')
      .orderBy('m.timestamp', 'ASC')
      .getRawMany<MsgRow>();

    if (rows.length === 0) return { processed: 0, skipped: 0, created: 0 };

    // Pré-charger les externalIds déjà présents
    const extIdOf = (r: MsgRow) => r.externalId ?? r.messageId ?? r.msgId;
    const externalIds = rows.map(extIdOf);
    const existing = await this.missedCallRepo.find({
      where: { externalId: In(externalIds) },
      select: ['externalId'],
    });
    const existingSet = new Set(existing.map((e) => e.externalId));

    let created = 0;
    let skipped = 0;

    for (const row of rows) {
      const extId = extIdOf(row);
      if (existingSet.has(extId)) { skipped++; continue; }

      const clientPhone = normalizePhone(row.clientPhone || row.contactClient) || row.clientPhone || row.contactClient;
      const occurredAt  = row.occurredAt instanceof Date ? row.occurredAt : new Date(row.occurredAt);

      try {
        if (row.unreadCount > 0) {
          // Conversation encore non traitée — créer événement + tâche normalement
          await this.handle({
            source:       'whatsapp',
            externalId:   extId,
            clientPhone,
            posteId:      row.posteId ?? null,
            commercialId: null,
            occurredAt,
            clientName:   row.clientName || null,
          });
        } else {
          // Commercial a déjà répondu — enregistrer en fermé, pas de tâche
          const missed = this.missedCallRepo.create({
            id:           uuidv4(),
            source:       'whatsapp',
            externalId:   extId,
            occurredAt,
            clientPhone,
            clientName:   row.clientName || null,
            posteId:      row.posteId ?? null,
            commercialId: null,
            status:       'closed',
          });
          await this.missedCallRepo.save(missed);
        }
        created++;
      } catch (err) {
        this.logger.error(
          `BACKFILL_WA_ERROR externalId=${extId}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `BACKFILL_WHATSAPP_COMPLETE total=${rows.length} created=${created} skipped=${skipped}`,
    );
    return { processed: rows.length, skipped, created };
  }

  // ── Backfill historique call_event → missed_call_event ───────────────────

  async backfillFromCallEvents(): Promise<{ processed: number; skipped: number; created: number }> {
    const callEvents = await this.callEventRepo.find({
      where: { call_status: CallStatus.NO_ANSWER },
      order: { event_at: 'ASC' },
    });

    if (callEvents.length === 0) {
      return { processed: 0, skipped: 0, created: 0 };
    }

    // Pré-charger les externalIds déjà présents pour éviter les doublons
    const externalIds = callEvents.map((e) => e.external_id);
    const existing = await this.missedCallRepo.find({
      where: { externalId: In(externalIds) },
      select: ['externalId'],
    });
    const existingSet = new Set(existing.map((e) => e.externalId));

    // Résoudre poste_id en batch via commercial_id
    const commercialIds = [
      ...new Set(callEvents.map((e) => e.commercial_id).filter((id): id is string => !!id)),
    ];
    const commercialPosteMap = new Map<string, string | null>();
    if (commercialIds.length > 0) {
      const commercials = await this.commercialRepo.find({
        where: { id: In(commercialIds) },
        relations: ['poste'],
      });
      for (const c of commercials) {
        commercialPosteMap.set(c.id, c.poste?.id ?? null);
      }
    }

    let created = 0;
    let skipped = 0;

    for (const ce of callEvents) {
      if (existingSet.has(ce.external_id)) {
        skipped++;
        continue;
      }

      const posteId = ce.commercial_id ? (commercialPosteMap.get(ce.commercial_id) ?? null) : null;

      try {
        await this.handle({
          source:       'db2',
          externalId:   ce.external_id,
          clientPhone:  ce.client_phone,
          posteId,
          commercialId: ce.commercial_id ?? null,
          deviceId:     ce.device_id ?? null,
          occurredAt:   ce.event_at,
          clientName:   null,
        });
        created++;
      } catch (err) {
        this.logger.error(
          `BACKFILL_ERROR external_id=${ce.external_id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `BACKFILL_COMPLETE total=${callEvents.length} created=${created} skipped=${skipped}`,
    );
    return { processed: callEvents.length, skipped, created };
  }
}
