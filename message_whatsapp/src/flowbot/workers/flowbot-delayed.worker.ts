import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FLOWBOT_DELAYED_QUEUE } from 'src/queue/queue.constants';
import { FlowEngineService } from '../services/flow-engine.service';
import { FlowSessionService } from '../services/flow-session.service';
import { BotConversationService } from '../services/bot-conversation.service';
import { FlowTriggerService } from '../services/flow-trigger.service';
import { FlowSessionStatus } from '../entities/flow-session.entity';
import { BotConversationStatus } from '../entities/bot-conversation.entity';
import { BotInboundMessageEvent, BOT_INBOUND_EVENT } from '../events/bot-inbound-message.event';

@Processor(FLOWBOT_DELAYED_QUEUE)
export class FlowbotDelayedWorker extends WorkerHost {
  private readonly logger = new Logger(FlowbotDelayedWorker.name);

  constructor(
    private readonly flowEngine: FlowEngineService,
    private readonly sessionService: FlowSessionService,
    private readonly convService: BotConversationService,
    private readonly triggerService: FlowTriggerService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'resume-waiting-delay':
        return this.handleResumeWaitingDelay(job);
      case 'no-response-check':
        return this.handleNoResponseCheck(job);
      default:
        this.logger.warn(`FlowbotDelayedWorker: job inconnu "${job.name}"`);
    }
  }

  // ─── Handler : reprendre une session WAITING_DELAY après expiration du délai ──

  private async handleResumeWaitingDelay(job: Job<{ sessionId: string }>): Promise<void> {
    const { sessionId } = job.data;

    const session = await this.sessionService.findById(sessionId);
    if (!session) {
      this.logger.debug(`resume-waiting-delay: session ${sessionId} introuvable — ignoré`);
      return;
    }

    if (session.status !== FlowSessionStatus.WAITING_DELAY) {
      this.logger.debug(
        `resume-waiting-delay: session ${sessionId} status=${session.status} — ignoré (idempotence)`,
      );
      return;
    }

    this.logger.log(`resume-waiting-delay: reprise session ${sessionId}`);
    await this.flowEngine.resumeSession(sessionId, 'delay_expired');
  }

  // ─── Handler : vérifier no-response après délai WAITING_REPLY ────────────────

  private async handleNoResponseCheck(
    job: Job<{ sessionId: string; conversationId: string }>,
  ): Promise<void> {
    const { sessionId, conversationId } = job.data;

    const session = await this.sessionService.findById(sessionId);
    if (!session) {
      this.logger.debug(`no-response-check: session ${sessionId} introuvable — ignoré`);
      return;
    }

    if (session.status !== FlowSessionStatus.WAITING_REPLY) {
      // L'utilisateur a déjà répondu ou la session a été reprise — idempotence
      this.logger.debug(
        `no-response-check: session ${sessionId} status=${session.status} — ignoré (utilisateur a répondu)`,
      );
      return;
    }

    try {
      const conv = await this.convService.findById(conversationId);
      if (!conv || conv.status !== BotConversationStatus.BOT_ACTIVE) {
        this.logger.debug(
          `no-response-check: conv ${conversationId} absente ou non BOT_ACTIVE — ignoré`,
        );
        return;
      }

      const v = session.variables ?? {};
      const fakeEvent = this.buildNoResponseEvent(session, v);

      const match = await this.triggerService.findMatchingFlow(conv, fakeEvent);
      if (!match) {
        // Pas de flow NO_RESPONSE → reprendre la session courante directement
        await this.flowEngine.resumeSession(sessionId, 'no_response_timeout');
        return;
      }

      // Un flow NO_RESPONSE trouvé → l'émettre comme event normal
      this.eventEmitter.emit(BOT_INBOUND_EVENT, fakeEvent);
    } catch (err) {
      this.logger.error(
        `no-response-check: erreur session ${sessionId} — ${(err as Error).message}`,
        (err as Error).stack,
      );
      // Re-lever pour que BullMQ marque le job en échec et réessaie si configuré
      throw err;
    }
  }

  // ─── Helper : construire l'événement no-response ──────────────────────────

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
    event.externalMessageRef = `delayed:no_response:${session.conversationId}:${Date.now()}`;
    event.receivedAt = new Date();
    event.isNewConversation = false;
    event.isReopened = false;
    event.isOutOfHours = false;
    return event;
  }
}
