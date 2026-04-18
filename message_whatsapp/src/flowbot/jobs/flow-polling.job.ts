import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FlowEngineService } from '../services/flow-engine.service';
import { FlowSessionService } from '../services/flow-session.service';
import { FlowTriggerService } from '../services/flow-trigger.service';
import { BotConversationService } from '../services/bot-conversation.service';
import { FlowSessionStatus } from '../entities/flow-session.entity';
import { FlowTriggerType } from '../entities/flow-trigger.entity';
import { BotConversationStatus } from '../entities/bot-conversation.entity';
import { BotInboundMessageEvent, BOT_INBOUND_EVENT } from '../events/bot-inbound-message.event';
import { EventEmitter2 } from '@nestjs/event-emitter';

/** Seuil WAITING_DELAY expiré (secondes) */
const WAIT_DELAY_THRESHOLD_SECONDS = 30;

/** Seuil WAITING_REPLY → NO_RESPONSE (secondes, ~30 min) */
const NO_RESPONSE_THRESHOLD_SECONDS = 1800;

/** Seuil QUEUE_WAIT — conversation sans agent depuis N minutes */
const QUEUE_WAIT_THRESHOLD_MINUTES = 30;

/** Seuil INACTIVITY — aucune activité depuis N minutes */
const INACTIVITY_THRESHOLD_MINUTES = 120;

/** Fenêtre 23h WhatsApp — au-delà, l'envoi sera refusé par le provider */
const WHATSAPP_WINDOW_MS = 23 * 60 * 60 * 1000;

@Injectable()
export class FlowPollingJob {
  private readonly logger = new Logger(FlowPollingJob.name);

  constructor(
    private readonly flowEngine: FlowEngineService,
    private readonly sessionService: FlowSessionService,
    private readonly triggerService: FlowTriggerService,
    private readonly convService: BotConversationService,
    private readonly eventEmitter: EventEmitter2,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Toutes les 30 secondes — reprend les sessions bloquées sur un nœud WAIT
   * dont le délai est expiré.
   */
  @Cron('*/30 * * * * *')
  async resumeExpiredWaitingSessions(): Promise<void> {
    const sessions = await this.sessionService.findExpiredWaitingDelay(WAIT_DELAY_THRESHOLD_SECONDS);
    if (!sessions.length) return;

    this.logger.log(`FlowPollingJob: ${sessions.length} sessions WAITING_DELAY expirées à reprendre`);

    for (const session of sessions) {
      try {
        await this.flowEngine.resumeSession(session.id, 'delay_expired');
      } catch (err) {
        this.logger.error(
          `FlowPollingJob: erreur reprise session ${session.id} — ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Toutes les minutes — déclenche le trigger NO_RESPONSE pour les conversations
   * dont la session est en WAITING_REPLY depuis trop longtemps.
   *
   * Cela permet au FlowBot de réagir si l'utilisateur ne répond pas
   * (ex: envoyer un message de relance, escalader vers un agent).
   */
  @Cron('0 * * * * *')
  async checkNoResponseSessions(): Promise<void> {
    const sessions = await this.sessionService.findExpiredWaitingReply(NO_RESPONSE_THRESHOLD_SECONDS);
    if (!sessions.length) return;

    this.logger.log(`FlowPollingJob: ${sessions.length} sessions WAITING_REPLY sans réponse`);

    for (const session of sessions) {
      try {
        const conv = await this.convService.findById(session.conversationId);
        if (!conv || conv.status !== BotConversationStatus.BOT_ACTIVE) continue;

        // Vérifier si un flow a un trigger NO_RESPONSE pour cette conversation
        const v = session.variables ?? {};
        const fakeEvent = this.buildNoResponseEvent(session, v);

        const match = await this.triggerService.findMatchingFlow(conv, fakeEvent);
        if (!match) {
          // Pas de flow NO_RESPONSE → simplement reprendre la session courante
          await this.flowEngine.resumeSession(session.id, 'no_response_timeout');
          continue;
        }

        // Un nouveau flow NO_RESPONSE a été trouvé → l'émettre comme event normal
        // pour que le moteur le traite proprement
        this.eventEmitter.emit(BOT_INBOUND_EVENT, fakeEvent);
      } catch (err) {
        this.logger.error(
          `FlowPollingJob: erreur vérification no-response session ${session.id} — ${(err as Error).message}`,
        );
      }
    }
  }

  // ─── QUEUE_WAIT polling ────────────────────────────────────────────────────

  /**
   * Toutes les 5 minutes — déclenche QUEUE_WAIT pour les conversations
   * non assignées en attente depuis plus de QUEUE_WAIT_THRESHOLD_MINUTES.
   * Respecte la fenêtre 23h WhatsApp.
   */
  @Cron('0 */5 * * * *')
  async pollQueueWait(): Promise<void> {
    const match = await this.triggerService.findActiveFlowForTriggerType(FlowTriggerType.QUEUE_WAIT);
    if (!match) return;

    const thresholdDate = new Date(Date.now() - QUEUE_WAIT_THRESHOLD_MINUTES * 60_000);
    const window23hDate = new Date(Date.now() - WHATSAPP_WINDOW_MS);

    const chats: Array<{ chat_id: string; last_client_message_at: Date | null }> =
      await this.dataSource.query(
        `SELECT chat_id, last_client_message_at
         FROM whatsapp_chat
         WHERE status = 'en attente'
           AND poste_id IS NULL
           AND last_client_message_at IS NOT NULL
           AND last_client_message_at <= ?
           AND last_client_message_at >= ?
           AND deleted_at IS NULL`,
        [thresholdDate, window23hDate],
      );

    if (!chats.length) return;
    this.logger.log(`FlowPollingJob: ${chats.length} chat(s) QUEUE_WAIT à traiter`);

    for (const chat of chats) {
      try {
        await this.triggerPollingFlow(
          chat.chat_id,
          FlowTriggerType.QUEUE_WAIT,
          match.flow.id,
          chat.last_client_message_at ?? new Date(),
        );
      } catch (err) {
        this.logger.error(`FlowPollingJob QUEUE_WAIT ${chat.chat_id}: ${(err as Error).message}`);
      }
    }
  }

  // ─── INACTIVITY polling ────────────────────────────────────────────────────

  /**
   * Toutes les 5 minutes — déclenche INACTIVITY pour les conversations actives
   * sans aucune activité depuis plus de INACTIVITY_THRESHOLD_MINUTES.
   */
  @Cron('30 */5 * * * *')
  async pollInactivity(): Promise<void> {
    const match = await this.triggerService.findActiveFlowForTriggerType(FlowTriggerType.INACTIVITY);
    if (!match) return;

    const thresholdDate = new Date(Date.now() - INACTIVITY_THRESHOLD_MINUTES * 60_000);

    const chats: Array<{ chat_id: string; last_client_message_at: Date | null; last_activity_at: Date | null }> =
      await this.dataSource.query(
        `SELECT chat_id, last_client_message_at, last_activity_at
         FROM whatsapp_chat
         WHERE status IN ('actif', 'en attente')
           AND last_activity_at IS NOT NULL
           AND last_activity_at <= ?
           AND deleted_at IS NULL`,
        [thresholdDate],
      );

    if (!chats.length) return;
    this.logger.log(`FlowPollingJob: ${chats.length} chat(s) INACTIVITY à traiter`);

    for (const chat of chats) {
      try {
        // Vérifier fenêtre 23h avant d'envoyer
        const lastMsg = chat.last_client_message_at;
        if (lastMsg && Date.now() - lastMsg.getTime() > WHATSAPP_WINDOW_MS) continue;

        await this.triggerPollingFlow(
          chat.chat_id,
          FlowTriggerType.INACTIVITY,
          match.flow.id,
          chat.last_client_message_at ?? new Date(),
        );
      } catch (err) {
        this.logger.error(`FlowPollingJob INACTIVITY ${chat.chat_id}: ${(err as Error).message}`);
      }
    }
  }

  // ─── Helper commun pour les triggers de polling ────────────────────────────

  private async triggerPollingFlow(
    chatId: string,
    triggerType: FlowTriggerType,
    flowId: string,
    lastInboundAt: Date,
  ): Promise<void> {
    // Trouver ou créer la BotConversation associée
    let conv = await this.convService.findByChatRef(chatId);
    if (!conv) {
      conv = await this.convService.createForChatRef(chatId);
    }

    // Ne pas relancer si une session est déjà active sur cette conv
    const active = await this.sessionService.getActiveSession(conv);
    if (active && active.status === FlowSessionStatus.ACTIVE) return;

    const event = this.buildPollingEvent(chatId, triggerType, flowId, lastInboundAt);
    this.eventEmitter.emit(BOT_INBOUND_EVENT, event);
  }

  private buildPollingEvent(
    chatId: string,
    triggerType: FlowTriggerType,
    _flowId: string,
    lastInboundAt: Date,
  ): BotInboundMessageEvent {
    const event = new BotInboundMessageEvent();
    event.provider = 'whapi';
    event.channelType = 'whatsapp';
    event.conversationExternalRef = chatId;
    event.contactExternalId = chatId;
    event.contactName = '';
    event.messageText = undefined;
    event.messageType = 'text';
    event.externalMessageRef = `polling:${triggerType}:${chatId}:${Date.now()}`;
    event.receivedAt = lastInboundAt;
    event.isNewConversation = false;
    event.isReopened = triggerType === FlowTriggerType.INACTIVITY ? false : false;
    event.isOutOfHours = false;
    return event;
  }

  private buildNoResponseEvent(
    session: { variables: Record<string, unknown>; conversationId: string },
    v: Record<string, unknown>,
  ): BotInboundMessageEvent {
    const event = new BotInboundMessageEvent();
    event.provider = (v['__provider'] as string) ?? 'unknown';
    event.channelType = (v['__channelType'] as string) ?? 'whatsapp';
    event.providerChannelRef = (v['__providerChannelRef'] as string) || undefined;
    event.conversationExternalRef = (v['__externalRef'] as string) ?? '';
    event.contactExternalId = (v['__contactRef'] as string) ?? '';
    event.contactName = (v['__contactName'] as string) ?? '';
    event.messageText = undefined;
    event.messageType = 'text';
    event.externalMessageRef = `polling:no_response:${session.conversationId}:${Date.now()}`;
    event.receivedAt = new Date();
    event.isNewConversation = false;
    event.isReopened = false;
    event.isOutOfHours = false;
    return event;
  }
}
