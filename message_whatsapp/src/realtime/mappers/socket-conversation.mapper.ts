import {
  WhatsappChat,
  WhatsappChatStatus,
  WindowStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { resolveMessageText } from './socket-message.mapper';
import { CriterionState } from 'src/window/services/validation-engine.service';

export function mapConversation(
  chat: WhatsappChat,
  lastMessage: WhatsappMessage | null,
  unreadCount: number,
  validationState?: CriterionState[],
) {
  // window_status est la source de vérité ; is_locked comme fallback
  const windowStatus = chat.window_status ?? (chat.is_locked ? WindowStatus.LOCKED : WindowStatus.ACTIVE);
  const locked = windowStatus === WindowStatus.LOCKED;

  return {
    id: chat.id,
    chat_id: chat.chat_id,
    channel_id: chat.channel_id,
    last_msg_client_channel_id: chat.last_msg_client_channel_id,
    name: locked ? 'Contact masqué' : chat.name,
    poste_id: chat.poste_id,
    // Normalise 'en attente' → 'attente' une seule fois à la source
    status:
      chat.status === WhatsappChatStatus.EN_ATTENTE ? 'attente' : chat.status,
    unreadCount: locked ? 0 : unreadCount,
    createdAt: chat.createdAt,
    last_activity_at: chat.last_activity_at,
    last_client_message_at: locked ? null : (chat.last_client_message_at || null),
    last_poste_message_at: locked ? null : (chat.last_poste_message_at || null),
    updatedAt: chat.updatedAt,
    poste: chat.poste || null,
    last_message: locked
      ? null
      : lastMessage
        ? {
            id: lastMessage.id,
            text: resolveMessageText(lastMessage) ?? '',
            timestamp: lastMessage.timestamp ?? lastMessage.createdAt,
            from_me: lastMessage.from_me,
            status: lastMessage.status,
            type: lastMessage.type,
          }
        : null,
    read_only: chat.read_only,
    is_locked: locked,
    is_priority: chat.is_priority ?? false,
    window_slot: chat.window_slot ?? null,
    window_status: windowStatus,
    contact_client: locked ? null : chat.contact_client,
    first_response_deadline_at: locked ? null : chat.first_response_deadline_at,
    validation_state: locked ? null : (validationState ?? null),
  };
}

export function mapConversationWithContact(
  chat: WhatsappChat,
  lastMessage: WhatsappMessage | null,
  unreadCount: number,
  contact?: Contact,
  validationState?: CriterionState[],
  reportSubmissionStatus?: 'pending' | 'sent' | 'failed' | null,
) {
  return {
    ...mapConversation(chat, lastMessage, unreadCount, validationState),
    report_submission_status: reportSubmissionStatus ?? null,
    contact_summary: contact
      ? {
          id: contact.id,
          call_status: contact.call_status,
          call_count: contact.call_count ?? 0,
          priority: contact.priority ?? null,
          source: contact.source ?? null,
          tags: [],
          conversion_status: contact.conversion_status ?? null,
          last_call_date: contact.last_call_date ?? null,
          is_active: contact.is_active,
        }
      : null,
  };
}
