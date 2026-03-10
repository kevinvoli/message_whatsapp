'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useSocket } from '@/contexts/SocketProvider';
import { useChatStore } from '@/store/chatStore';
import { useContactStore } from '@/store/contactStore';
import { logger } from '@/lib/logger';
import {
  Contact,
  Conversation,
  Message,
  transformToContact,
  transformToConversation,
  transformToMessage,
  transformToCallLog,
} from '@/types/chat';

const WebSocketEvents = () => {
  const { socket } = useSocket();
  const { user } = useAuth();

  const setSocket = useChatStore((s) => s.setSocket);
  const loadConversations = useChatStore((s) => s.loadConversations);

  useEffect(() => {
    if (!socket || !user) {
      return;
    }

    setSocket(socket);

    const refreshAfterConnect = () => {
      loadConversations();
      socket.emit('contacts:get');

      const selectedChatId = useChatStore.getState().selectedConversation?.chat_id;
      if (selectedChatId) {
        socket.emit('messages:get', { chat_id: selectedChatId });
      }
    };

    const upsertConversationPatch = (
      chatId: string,
      patch: Partial<Conversation>,
    ) => {
      const state = useChatStore.getState();
      const existingConversation = state.conversations.find(
        (c) => c.chat_id === chatId,
      );

      if (!existingConversation) {
        return;
      }

      state.updateConversation({
        ...existingConversation,
        ...patch,
      });
    };

    const handleChatEvent = (data: { type: string; payload: any }) => {
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

          // Marquer comme lu immédiatement si message entrant dans la conv active
          if (
            !message.from_me &&
            chatState.selectedConversation?.chat_id === message.chat_id
          ) {
            socket.emit('messages:read', { chat_id: message.chat_id });
          }

          // Notification navigateur si onglet en arriere-plan et message entrant
          if (
            typeof document !== 'undefined' &&
            document.hidden &&
            !message.from_me
          ) {
            if (Notification.permission === 'granted') {
              new Notification('Nouveau message', {
                body: message.text || 'Media recu',
                icon: '/favicon.ico',
              });
            // requestPermission() ne peut être appelé que depuis un geste utilisateur
            // → la demande est faite au login, pas ici
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
          chatState.setMessages(data.payload.chat_id, messages);
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
          const conversations: Conversation[] = data.payload.map(transformToConversation);
          chatState.setConversations(conversations);
          break;
        }

        case 'CONVERSATION_READONLY':
          upsertConversationPatch(data.payload.chat_id, {
            readonly: true,
          });
          break;

        case 'TYPING_START': {
          const payload = data.payload as { chat_id: string; commercial_id?: string };
          if (payload.commercial_id && payload.commercial_id === user.id) {
            break;
          }
          chatState.setTyping(payload.chat_id);
          break;
        }

        case 'TYPING_STOP': {
          const payload = data.payload as { chat_id: string; commercial_id?: string };
          if (payload.commercial_id && payload.commercial_id === user.id) {
            break;
          }
          chatState.clearTyping(payload.chat_id);
          break;
        }

        case 'MESSAGE_STATUS_UPDATE': {
          const { chat_id, message_id, status } = data.payload as {
            message_id: string;
            external_id?: string;
            chat_id: string;
            status: string;
            error_code?: number;
            error_title?: string;
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
            const current = chatState.messages;
            const next = current.map((msg) =>
              msg.id === tempId ? { ...msg, status: 'error' as const } : msg,
            );
            const selectedChatId = chatState.selectedConversation?.chat_id;
            if (selectedChatId) {
              chatState.setMessages(selectedChatId, next);
            }
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
    };

    const handleContactEvent = (data: { type: string; payload: any }) => {
      const contactState = useContactStore.getState();

      switch (data.type) {
        case 'CONTACT_LIST': {
          const contacts: Contact[] = data.payload.map(transformToContact);
          contactState.setContacts(contacts);
          break;
        }
        case 'CONTACT_UPSERT': {
          const contact: Contact = transformToContact(data.payload);
          contactState.upsertContact(contact);
          break;
        }
        case 'CONTACT_REMOVED': {
          const contactId =
            data.payload?.contact_id ?? data.payload?.id ?? data.payload;
          if (typeof contactId === 'string') {
            contactState.removeContact(contactId);
          }
          break;
        }
        case 'CONTACT_CALL_STATUS_UPDATED': {
          const contact: Contact = transformToContact(data.payload);
          contactState.upsertContact(contact);
          break;
        }
        case 'CALL_LOG_LIST': {
          const { contact_id, call_logs } = data.payload as { contact_id: string; call_logs: any[] };
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
    };

    const handleSocketError = (error: { message: string; details?: string }) => {
      logger.error('Socket error received', {
        message: error.message,
        details: error.details,
      });
    };

    socket.on('chat:event', handleChatEvent);
    socket.on('contact:event', handleContactEvent);
    socket.on('error', handleSocketError);
    socket.on('connect', refreshAfterConnect);

    if (socket.connected) {
      refreshAfterConnect();
    }

    return () => {
      socket.off('chat:event', handleChatEvent);
      socket.off('contact:event', handleContactEvent);
      socket.off('error', handleSocketError);
      socket.off('connect', refreshAfterConnect);
      setSocket(null);
    };
  }, [socket, user, setSocket, loadConversations]);

  return null;
};

export default WebSocketEvents;
