import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FlowEngineService } from '../services/flow-engine.service';
import { FlowSessionService } from '../services/flow-session.service';
import { FlowTriggerService } from '../services/flow-trigger.service';
import { BotConversationService } from '../services/bot-conversation.service';
import { FlowSessionStatus } from '../entities/flow-session.entity';
import { FlowTriggerType } from '../entities/flow-trigger.entity';
import { BotConversationStatus } from '../entities/bot-conversation.entity';
import { BotInboundMessageEvent, BOT_INBOUND_EVENT } from '../events/bot-inbound-message.event';
import { EventEmitter2 } from '@nestjs/event-emitter';

/** Seuil au-delà duquel une session WAITING_DELAY est considérée expirée (secondes) */
const WAIT_DELAY_THRESHOLD_SECONDS = 30;

/** Seuil au-delà duquel une session WAITING_REPLY peut déclencher NO_RESPONSE (secondes, ~30 min) */
const NO_RESPONSE_THRESHOLD_SECONDS = 1800;

@Injectable()
export class FlowPollingJob {
  private readonly logger = new Logger(FlowPollingJob.name);

  constructor(
    private readonly flowEngine: FlowEngineService,
    private readonly sessionService: FlowSessionService,
    private readonly triggerService: FlowTriggerService,
    private readonly convService: BotConversationService,
    private readonly eventEmitter: EventEmitter2,
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
