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
  ) {}

  // ─── Messages entrants ────────────────────────────────────────────────────

  async handleMessages(messages: UnifiedMessage[]): Promise<void> {
    if (!messages.length) return;

    for (const message of messages) {
      const traceId = this.buildTraceId(message.providerMessageId, message.chatId);
      this.logger.log(`INCOMING_RECEIVED trace=${traceId} type=${message.type}`);

      // Ignorer les messages sortants (envoyés par nous)
      if (message.direction !== 'in') continue;

      // ── Étape 1 : validation du chat_id ──────────────────────────────────
      const validation = this.chatIdValidation.validate(message.chatId);
      if (!validation.valid) {
        this.logger.warn(
          `INCOMING_IGNORED trace=${traceId} reason=${validation.reason} chat_id=${message.chatId ?? 'unknown'}`,
        );
        continue;
      }

      try {
        await this.getMutex(message.chatId).runExclusive(() =>
          this.processOneMessage(message, traceId),
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

  private async processOneMessage(message: UnifiedMessage, traceId: string): Promise<void> {
    // ── Étape 2 : enrichissement provider ────────────────────────────────────
    await this.providerEnrichment.enrich(message);

    // ── Étape 3 : assignation de la conversation ──────────────────────────────
    const conversation = await this.dispatcherService.assignConversation(
      message.chatId,
      message.fromName ?? 'Client',
      traceId,
      message.tenantId,
      message.channelId,
    );

    if (!conversation) {
      this.logger.warn(`INCOMING_NO_AGENT trace=${traceId} chat_id=${message.chatId}`);
      return;
    }

    // ── Étape 4 : persistance du message ──────────────────────────────────────
    const persistResult = await this.messagePersistence.persist(message, conversation, traceId);
    if (!persistResult.ok) return; // canal inconnu — HTTP 200 pour stopper les retries provider

    this.systemAlert.onInboundMessage();

    // ── Étape 5 : persistance des médias ─────────────────────────────────────
    const medias = this.mediaExtraction.extract(message);
    await this.mediaPersistence.persistAll(medias, persistResult.message, conversation, message);

    // ── Étape 6 : mise à jour état conversation ───────────────────────────────
    await this.stateUpdate.apply(conversation, persistResult.message);

    // ── Étape 7 : notification frontend via WebSocket ────────────────────────
    await this.messageGateway.notifyNewMessage(persistResult.message, conversation, persistResult.message);
    this.logger.log(`INCOMING_DISPATCHED trace=${traceId} poste_id=${conversation.poste_id}`);

    // ── Étape 8 : déclenchement automatismes (découplé via EventEmitter2) ───
    this.eventEmitter.emit(INBOUND_MESSAGE_PROCESSED_EVENT, {
      conversation,
      message: persistResult.message,
      traceId,
    } satisfies InboundMessageProcessedEvent);
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
}
