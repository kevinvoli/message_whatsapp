/**
 * TICKET-08-C — Routeur d'événements Socket.IO.
 *
 * Exporte des handlers purs qui reçoivent un événement socket et
 * le dispatch vers le bon store. Chaque handler est une fonction
 * indépendante, testable sans instancier de socket.
 *
 * Ajouter un nouvel événement = ajouter une ligne dans le switch
 * du handler correspondant, ou exporter un nouveau handler.
 */

import { Socket } from 'socket.io-client';
import { Conversation, Message, transformToContact, transformToCallLog } from '@/types/chat';
import { transformToMessage } from '@/lib/mappers/message.mapper';
import { transformToConversation } from '@/lib/mappers/conversation.mapper';
import { useChatStore } from '@/store/chatStore';
import { useContactStore } from '@/store/contactStore';
import { logger } from '@/lib/logger';

// ─── Handler : événements conversation / message ──────────────────────────────

export function handleChatEvent(
  data: { type: string; payload: any },
  socket: Socket,
  userId: string,
): void {
  const chatState = useChatStore.getState();

  switch (data.type) {
    case 'MESSAGE_ADD': {
      const message: Message = transformToMessage(data.payload);
      const tempId = (data.payload as { tempId?: string }).tempId;

      if (tempId) {
        const idx = chatState.messages.findIndex((m) => m.id === tempId);
        if (idx > -1) {
          const updatedMessages = [...chatState.messages];
          updatedMessages[idx] = message;
          chatState.setMessages(message.chat_id, updatedMessages);
          break;
        }
      }

      chatState.addMessage(message);

      if (!message.from_me && chatState.selectedConversation?.chat_id === message.chat_id) {
        socket.emit('messages:read', { chat_id: message.chat_id });
      }

      if (typeof document !== 'undefined' && document.hidden && !message.from_me) {
        if (Notification.permission === 'granted') {
          new Notification('Nouveau message', {
            body: message.text || 'Media recu',
            icon: '/favicon.ico',
          });
        }
      }
      break;
    }

    case 'CONVERSATION_UPSERT': {
      const conversation: Conversation = transformToConversation(data.payload);
      chatState.updateConversation(conversation);
      break;
    }

    case 'MESSAGE_LIST': {
      const messages: Message[] = data.payload.messages.map(transformToMessage);
      chatState.setMessages(data.payload.chat_id, messages, !!data.payload.hasMore);
      break;
    }

    case 'MESSAGE_LIST_PREPEND': {
      const older: Message[] = data.payload.messages.map(transformToMessage);
      chatState.prependMessages(data.payload.chat_id, older, !!data.payload.hasMore);
      break;
    }

    case 'CONVERSATION_REMOVED':
      chatState.removeConversationBychat_id(data.payload.chat_id);
      break;

    case 'CONVERSATION_ASSIGNED': {
      const conversation: Conversation = transformToConversation(data.payload);
      chatState.addConversation(conversation);
      break;
    }

    case 'CONVERSATION_LIST': {
      const raw = data.payload;
      const isNewFormat =
        raw && typeof raw === 'object' && !Array.isArray(raw) && 'conversations' in raw;

      const convArray: Conversation[] = isNewFormat
        ? raw.conversations.map(transformToConversation)
        : (raw as Parameters<typeof transformToConversation>[0][]).map(transformToConversation);

      const hasMore: boolean = isNewFormat ? raw.hasMore : false;
      const nextCursor = isNewFormat ? raw.nextCursor : null;

      if (chatState.isLoadingMoreConversations) {
        chatState.appendConversations(convArray, hasMore, nextCursor);
      } else {
        chatState.setConversations(convArray, hasMore, nextCursor);
      }
      break;
    }

    case 'TOTAL_UNREAD_UPDATE':
      chatState.setTotalUnread((data.payload as { totalUnread: number }).totalUnread);
      break;

    case 'CONVERSATION_READONLY':
      upsertConversationPatch(data.payload.chat_id, { readonly: true });
      break;

    case 'TYPING_START': {
      const payload = data.payload as { chat_id: string; commercial_id?: string };
      if (payload.commercial_id && payload.commercial_id === userId) break;
      chatState.setTyping(payload.chat_id);
      break;
    }

    case 'TYPING_STOP': {
      const payload = data.payload as { chat_id: string; commercial_id?: string };
      if (payload.commercial_id && payload.commercial_id === userId) break;
      chatState.clearTyping(payload.chat_id);
      break;
    }

    case 'MESSAGE_STATUS_UPDATE': {
      const { chat_id, message_id, status } = data.payload as {
        message_id: string;
        chat_id: string;
        status: string;
      };
      const frontStatus = status === 'failed' ? 'error' : status;
      chatState.updateMessageStatus(chat_id, message_id, frontStatus as Message['status']);
      break;
    }

    case 'RATE_LIMITED': {
      const event = (data.payload as { event?: string }).event ?? 'unknown';
      logger.warn('Rate limited by server', { event });
      break;
    }

    case 'MESSAGE_SEND_ERROR': {
      const tempId = (data.payload as { tempId?: string }).tempId;
      if (tempId) {
        const next = chatState.messages.map((msg) =>
          msg.id === tempId ? { ...msg, status: 'error' as const } : msg,
        );
        const selectedChatId = chatState.selectedConversation?.chat_id;
        if (selectedChatId) chatState.setMessages(selectedChatId, next);
      }
      logger.warn('Message send error received', {
        code: data.payload?.code,
        message: data.payload?.message,
      });
      break;
    }

    default:
      logger.warn('Unhandled chat event type', { type: data.type });
  }
}

// ─── Handler : événements contact ─────────────────────────────────────────────

export function handleContactEvent(data: { type: string; payload: any }): void {
  const contactState = useContactStore.getState();
  const chatState = useChatStore.getState();

  switch (data.type) {
    case 'CONTACT_DETAIL': {
      contactState.setSelectedContactDetail(
        data.payload ? transformToContact(data.payload) : null,
      );
      break;
    }
    case 'CONTACT_UPSERT':
    case 'CONTACT_CALL_STATUS_UPDATED': {
      const contact = transformToContact(data.payload);
      if (contact.chat_id) {
        chatState.updateConversationContactSummary(contact.chat_id, {
          id: contact.id,
          call_status: contact.call_status,
          call_count: contact.call_count,
          priority: contact.priority,
          source: contact.source,
          tags: contact.tags,
          conversion_status: contact.conversion_status,
          last_call_date: contact.last_call_date ?? null,
          is_active: contact.is_active,
        });
      }
      contactState.upsertContact(contact);
      break;
    }
    case 'CONTACT_REMOVED': {
      const contactId = data.payload?.contact_id ?? data.payload?.id ?? data.payload;
      if (typeof contactId === 'string') contactState.removeContact(contactId);
      break;
    }
    case 'CALL_LOG_LIST': {
      const { contact_id, call_logs } = data.payload as {
        contact_id: string;
        call_logs: any[];
      };
      contactState.setCallLogs(contact_id, call_logs.map(transformToCallLog));
      break;
    }
    case 'CALL_LOG_NEW': {
      const { call_log } = data.payload as { contact_id: string; call_log: any };
      contactState.addCallLog(transformToCallLog(call_log));
      break;
    }
    default:
      logger.warn('Unhandled contact event type', { type: data.type });
  }
}

// ─── Handler : erreurs socket ─────────────────────────────────────────────────

export function handleSocketError(error: { message: string; details?: string }): void {
  logger.error('Socket error received', { message: error.message, details: error.details });
}

// ─── Handler : queue ──────────────────────────────────────────────────────────

export function handleQueueUpdated(data: {
  timestamp: string;
  reason: string;
  data: unknown[];
}): void {
  logger.debug('Queue updated', { reason: data.reason, size: data.data?.length });
}

// ─── Utilitaire interne ───────────────────────────────────────────────────────

function upsertConversationPatch(chatId: string, patch: Partial<Conversation>): void {
  const state = useChatStore.getState();
  const existing = state.conversations.find((c) => c.chat_id === chatId);
  if (!existing) return;
  state.updateConversation({ ...existing, ...patch });
}
