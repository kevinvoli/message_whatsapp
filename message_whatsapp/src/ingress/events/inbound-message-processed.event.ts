/**
 * TICKET-04-A — Événement émis après traitement complet d'un message entrant.
 *
 * Découple le pipeline ingress des consommateurs (auto-messages, analytics, etc.)
 * via EventEmitter2. Chaque consommateur s'abonne via `@OnEvent(INBOUND_MESSAGE_PROCESSED_EVENT)`.
 */
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

export const INBOUND_MESSAGE_PROCESSED_EVENT = 'inbound.message.processed' as const;

export interface InboundMessageProcessedEvent {
  /** Conversation mise à jour après réception du message. */
  conversation: WhatsappChat;
  /** Message persisté et enrichi (avec médias). */
  message: WhatsappMessage;
  /** Identifiant de trace pour le suivi de bout en bout. */
  traceId: string;
}
