import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { resolveMessageText } from './socket-message.mapper';

export function mapConversation(
  chat: WhatsappChat,
  lastMessage: WhatsappMessage | null,
  unreadCount: number,
) {
  return {
    id: chat.id,
    chat_id: chat.chat_id,
    channel_id: chat.channel_id,
    last_msg_client_channel_id: chat.last_msg_client_channel_id,
    name: chat.name,
    poste_id: chat.poste_id,
    // Normalise 'en attente' → 'attente' une seule fois à la source
    status:
      chat.status === WhatsappChatStatus.EN_ATTENTE ? 'attente' : chat.status,
    unreadCount,
    createdAt: chat.createdAt,
    auto_message_status: chat.auto_message_status,
    last_activity_at: chat.last_activity_at,
    last_client_message_at: chat.last_client_message_at || null,
    last_poste_message_at: chat.last_poste_message_at || null,
    updatedAt: chat.updatedAt,
    poste: chat.poste || null,
    last_message: lastMessage
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
    contact_client: chat.contact_client,
    first_response_deadline_at: chat.first_response_deadline_at,
  };
}

export function mapConversationWithContact(
  chat: WhatsappChat,
  lastMessage: WhatsappMessage | null,
  unreadCount: number,
  contact?: Contact,
) {
  return {
    ...mapConversation(chat, lastMessage, unreadCount),
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
