/**
 * TICKET-04-A — Orchestrateur du pipeline ingress entrant.
 *
 * Ce service ne contient AUCUNE logique métier inline.
 * Chaque étape est déléguée à un service spécialisé, testable indépendamment.
 *
 * Pipeline complet :
 *   1. [ChatIdValidationService]          — valider le format du chat_id
 *   2. [ProviderEnrichmentService]        — enrichir le message (nom Messenger, etc.)
 *   3. [DispatcherService]                — assigner la conversation à un poste
 *   4. [IncomingMessagePersistenceService] — persister le message (+ gestion canal inconnu)
 *   5. [MediaPersistenceService]          — persister les médias attachés
 *   6. [InboundStateUpdateService]        — mettre à jour l'état DB de la conversation
 *   7. [ConversationPublisher / gateway]  — notifier le frontend via WebSocket
 *   8. EventEmitter2 'inbound.message.processed' — déclencher les automatismes
 */
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Mutex, MutexInterface, withTimeout } from 'async-mutex';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { SystemAlertService } from 'src/system-alert/system-alert.service';
import { UnifiedMessage } from './normalization/unified-message';
import { UnifiedStatus } from './normalization/unified-status';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { ChatIdValidationService } from 'src/ingress/domain/chat-id-validation.service';
import { ProviderEnrichmentService } from 'src/ingress/domain/provider-enrichment.service';
import { IncomingMessagePersistenceService } from 'src/ingress/infrastructure/incoming-message-persistence.service';
import { InboundStateUpdateService } from 'src/ingress/domain/inbound-state-update.service';
import { MediaExtractionService } from 'src/ingress/domain/media-extraction.service';
import { MediaPersistenceService } from 'src/ingress/infrastructure/media-persistence.service';
import {
  INBOUND_MESSAGE_PROCESSED_EVENT,
  InboundMessageProcessedEvent,
} from 'src/ingress/events/inbound-message-processed.event';
import {
  BOT_INBOUND_EVENT,
  BotInboundMessageEvent,
} from 'src/flowbot/events/bot-inbound-message.event';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ChannelService } from 'src/channel/channel.service';
import { CommunicationMessengerService } from 'src/communication_whapi/communication_messenger.service';

@Injectable()
export class InboundMessageService {
  private readonly logger = new Logger(InboundMessageService.name);
  private readonly chatMutexes = new Map<string, MutexInterface>();

  constructor(
    // ── Étape 3 ─────────────────────────────────────────────────────────────
    private readonly dispatcherService: DispatcherService,
    // ── Étape 7 ─────────────────────────────────────────────────────────────
    private readonly messageGateway: WhatsappMessageGateway,
    // ── Observabilité ────────────────────────────────────────────────────────
    private readonly systemAlert: SystemAlertService,
    // ── Statuts sortants ─────────────────────────────────────────────────────
    private readonly whatsappMessageService: WhatsappMessageService,
    // ── Étapes du pipeline ───────────────────────────────────────────────────
    private readonly chatIdValidation: ChatIdValidationService,
    private readonly providerEnrichment: ProviderEnrichmentService,
    private readonly messagePersistence: IncomingMessagePersistenceService,
    private readonly stateUpdate: InboundStateUpdateService,
    private readonly mediaExtraction: MediaExtractionService,
    private readonly mediaPersistence: MediaPersistenceService,
    // ── Étape 8 — découplage via événements ──────────────────────────────────
    private readonly eventEmitter: EventEmitter2,
    // ── Résolution nom Messenger ─────────────────────────────────────────────
    private readonly channelService: ChannelService,
    private readonly messengerService: CommunicationMessengerService,
  ) {}

  // ─── Messages entrants ────────────────────────────────────────────────────

  async handleMessages(messages: UnifiedMessage[]): Promise<void> {
    if (!messages.length) return;

    for (const message of messages) {
      const traceId = this.buildTraceId(message.providerMessageId, message.chatId);
      const correlationId = message.correlationId ?? traceId;
      this.logger.log(
        `INCOMING_RECEIVED correlationId=${correlationId} provider_msg_id=${message.providerMessageId ?? 'none'} chat_id=${message.chatId} type=${message.type}`,
      );

      // Ignorer les messages sortants (envoyés par nous)
      if (message.direction !== 'in') continue;

      // ── Étape 1 : validation du chat_id ──────────────────────────────────
      const validation = this.chatIdValidation.validate(message.chatId);
      if (!validation.valid) {
        this.logger.warn(
          `INCOMING_IGNORED correlationId=${correlationId} reason=${validation.reason} chat_id=${message.chatId ?? 'unknown'}`,
        );
        continue;
      }

      // Résolution du nom pour Messenger (le webhook ne contient pas le nom).
      // L'appel est AVANT le mutex pour ne pas bloquer le verrou pendant l'appel Graph API.
      // Le timeout de 5s (dans getUserName) borne la latence ajoutée.
      if (message.provider === 'messenger' && !message.fromName && message.from && message.channelId) {
        message.fromName = await this.resolveMessengerFromName(message.from, message.channelId);
      }

      try {
        await this.getMutex(message.chatId).runExclusive(() =>
          this.processOneMessage(message, correlationId),
        );
      } catch (err) {
        throw new HttpException(
          { status: 'error', message: (err as Error).message || 'Webhook processing failed' },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  // ─── Statuts sortants ─────────────────────────────────────────────────────

  async handleStatuses(statuses: UnifiedStatus[]): Promise<void> {
    for (const status of statuses) {
      await this.whatsappMessageService.updateStatusFromUnified(status);
      this.logger.log(
        `STATUS_UPDATE provider_message_id=${status.providerMessageId} status=${status.status}`,
      );
      await this.messageGateway.notifyStatusUpdate({
        providerMessageId: status.providerMessageId,
        status: status.status,
        errorCode: status.errorCode,
        errorTitle: status.errorTitle,
      });
    }
  }

  // ─── Pipeline (cœur) ──────────────────────────────────────────────────────

  private async processOneMessage(message: UnifiedMessage, correlationId: string): Promise<void> {
    // ── Étape 2 : enrichissement provider ────────────────────────────────────
    await this.providerEnrichment.enrich(message);

    // ── Étape 3 : assignation de la conversation ──────────────────────────────
    const conversation = await this.dispatcherService.assignConversation(
      message.chatId,
      message.fromName ?? 'Client',
      correlationId,
      message.tenantId,
      message.channelId,
    );

    if (!conversation) {
      this.logger.warn(`INCOMING_NO_AGENT correlationId=${correlationId} chat_id=${message.chatId}`);
      return;
    }

    // ── Étape 4 : persistance du message ──────────────────────────────────────
    const persistResult = await this.messagePersistence.persist(message, conversation, correlationId);
    if (!persistResult.ok) return; // canal inconnu — HTTP 200 pour stopper les retries provider

    this.systemAlert.onInboundMessage();

    // ── Étape 5 : persistance des médias ─────────────────────────────────────
    const medias = this.mediaExtraction.extract(message);
    await this.mediaPersistence.persistAll(medias, persistResult.message, conversation, message);

    // ── Étape 6 : mise à jour état conversation ───────────────────────────────
    await this.stateUpdate.apply(conversation, persistResult.message);

    // ── Étape 7 : notification frontend via WebSocket ────────────────────────
    await this.messageGateway.notifyNewMessage(persistResult.message, conversation, persistResult.message);
    this.logger.log(`INCOMING_DISPATCHED correlationId=${correlationId} chat_id=${message.chatId} poste_id=${conversation.poste_id}`);

    // ── Étape 8 : déclenchement automatismes (découplé via EventEmitter2) ───
    this.eventEmitter.emit(INBOUND_MESSAGE_PROCESSED_EVENT, {
      conversation,
      message: persistResult.message,
      traceId: correlationId,
    } satisfies InboundMessageProcessedEvent);

    // ── Étape 9 : déclenchement FlowBot (découplé — fire-and-forget) ────────
    this.eventEmitter.emit(
      BOT_INBOUND_EVENT,
      this.buildBotInboundEvent(message, conversation),
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getMutex(chatId: string): MutexInterface {
    let mutex = this.chatMutexes.get(chatId);
    if (!mutex) {
      mutex = withTimeout(new Mutex(), 30_000);
      this.chatMutexes.set(chatId, mutex);
    }
    return mutex;
  }

  private buildTraceId(messageId?: string | null, chatId?: string): string {
    return messageId ?? `chat:${chatId ?? 'unknown'}:${Date.now()}`;
  }

  // ─── FlowBot mapping ──────────────────────────────────────────────────────

  private buildBotInboundEvent(
    msg: UnifiedMessage,
    conversation: WhatsappChat,
  ): BotInboundMessageEvent {
    const PROVIDER_TO_CHANNEL_TYPE: Record<string, string> = {
      whapi: 'whatsapp',
      meta: 'whatsapp',
      messenger: 'messenger',
      instagram: 'instagram',
      telegram: 'telegram',
    };

    const BOT_MSG_TYPES = new Set<string>([
      'text', 'image', 'audio', 'video', 'document', 'sticker', 'reaction',
    ]);
    const UNIFIED_TO_BOT_TYPE: Record<string, BotInboundMessageEvent['messageType']> = {
      voice: 'audio',
      gif: 'video',
      short: 'video',
    };

    const rawType = msg.type as string;
    const messageType: BotInboundMessageEvent['messageType'] =
      BOT_MSG_TYPES.has(rawType)
        ? (rawType as BotInboundMessageEvent['messageType'])
        : (UNIFIED_TO_BOT_TYPE[rawType] ?? 'text');

    const isNewConversation =
      conversation.createdAt instanceof Date &&
      Date.now() - conversation.createdAt.getTime() < 10_000;

    const event = new BotInboundMessageEvent();
    event.provider = msg.provider;
    event.channelType = PROVIDER_TO_CHANNEL_TYPE[msg.provider] ?? 'whatsapp';
    event.providerChannelRef = msg.channelId;
    event.conversationExternalRef = msg.chatId;
    event.contactExternalId = msg.from;
    event.contactName = msg.fromName ?? msg.from;
    event.messageText = msg.text;
    event.messageType = messageType;
    event.mediaUrl = msg.media?.link;
    event.externalMessageRef = msg.providerMessageId;
    event.receivedAt = new Date(msg.timestamp * 1000);
    event.isNewConversation = isNewConversation;
    event.isReopened = conversation.reopened_at !== null;
    event.isOutOfHours = false; // TODO: brancher BusinessHoursService (TICKET-12-B follow-up)
    event.agentAssignedRef = conversation.poste_id ?? undefined;
    return event;
  }

  /**
   * Résout le nom d'un expéditeur Messenger via Graph API.
   * Fire-and-forget sur erreur : ne bloque jamais le traitement du message.
   * Timeout de 5s sur l'appel Graph API (configuré dans getUserName).
   */
  private async resolveMessengerFromName(
    psid: string,
    channelId: string,
  ): Promise<string | undefined> {
    try {
      // Priorité 1 : recherche par channel_id (cas normal)
      // Priorité 2 : recherche par external_id (page ID) quand channel_id est NULL en BDD
      //   → dans ce cas channelId = pageId (fallback du webhook controller)
      const channel =
        (await this.channelService.findByChannelId(channelId)) ??
        (await this.channelService.findChannelByExternalId('messenger', channelId));

      if (!channel?.token) {
        this.logger.warn(
          `MESSENGER_NAME_SKIP psid=${psid} channelId=${channelId} — channel introuvable ou token manquant. Vérifiez la configuration du canal Messenger (token, external_id/page_id).`,
        );
        return undefined;
      }

      const name = await this.messengerService.getUserName(
        psid,
        channel.token,
        channel.external_id ?? undefined,
      );
      return name ?? undefined;
    } catch {
      return undefined;
    }
  }
}
