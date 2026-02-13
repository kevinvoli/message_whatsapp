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
} from '@/types/chat';

const WebSocketEvents = () => {
  const { socket } = useSocket();
  const { user } = useAuth();

  const {
    setSocket,
    setConversations,
    setMessages,
    addMessage,
    updateConversation,
    removeConversationBychat_id,
    addConversation,
    setTyping,
    clearTyping,
    loadConversations,
  } = useChatStore();

  const { setContacts, upsertContact, removeContact } = useContactStore();

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
      const existingConversation = useChatStore
        .getState()
        .conversations.find((c) => c.chat_id === chatId);

      if (!existingConversation) {
        return;
      }

      updateConversation({
        ...existingConversation,
        ...patch,
      });
    };

    const handleChatEvent = (data: { type: string; payload: any }) => {
      switch (data.type) {
        case 'MESSAGE_ADD': {
          const message: Message = transformToMessage(data.payload);
          const tempId = (data.payload as { tempId?: string }).tempId;

          if (tempId) {
            const idx = useChatStore
              .getState()
              .messages.findIndex((m) => m.id === tempId);

            if (idx > -1) {
              const updatedMessages = [...useChatStore.getState().messages];
              updatedMessages[idx] = message;
              useChatStore.getState().setMessages(message.chat_id, updatedMessages);
              break;
            }
          }

          addMessage(message);
          break;
        }

        case 'CONVERSATION_UPSERT': {
          const conversation: Conversation = transformToConversation(data.payload);
          updateConversation(conversation);
          break;
        }

        case 'MESSAGE_LIST': {
          const messages: Message[] = data.payload.messages.map(transformToMessage);
          setMessages(data.payload.chat_id, messages);
          break;
        }

        case 'CONVERSATION_REMOVED':
          removeConversationBychat_id(data.payload.chat_id);
          break;

        case 'CONVERSATION_ASSIGNED': {
          const conversation: Conversation = transformToConversation(data.payload);
          addConversation(conversation);
          break;
        }

        case 'CONVERSATION_LIST': {
          const conversations: Conversation[] = data.payload.map(transformToConversation);
          setConversations(conversations);
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
          setTyping(payload.chat_id);
          break;
        }

        case 'TYPING_STOP': {
          const payload = data.payload as { chat_id: string; commercial_id?: string };
          if (payload.commercial_id && payload.commercial_id === user.id) {
            break;
          }
          clearTyping(payload.chat_id);
          break;
        }

        case 'MESSAGE_SEND_ERROR': {
          const tempId = (data.payload as { tempId?: string }).tempId;
          if (tempId) {
            const current = useChatStore.getState().messages;
            const next = current.map((msg) =>
              msg.id === tempId ? { ...msg, status: 'error' as const } : msg,
            );
            const selectedChatId =
              useChatStore.getState().selectedConversation?.chat_id;
            if (selectedChatId) {
              useChatStore.getState().setMessages(selectedChatId, next);
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
      switch (data.type) {
        case 'CONTACT_LIST': {
          const contacts: Contact[] = data.payload.map(transformToContact);
          setContacts(contacts);
          break;
        }
        case 'CONTACT_UPSERT': {
          const contact: Contact = transformToContact(data.payload);
          upsertContact(contact);
          break;
        }
        case 'CONTACT_REMOVED': {
          const contactId =
            data.payload?.contact_id ?? data.payload?.id ?? data.payload;
          if (typeof contactId === 'string') {
            removeContact(contactId);
          }
          break;
        }
        case 'CONTACT_CALL_STATUS_UPDATED': {
          const contact: Contact = transformToContact(data.payload);
          upsertContact(contact);
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
    socket.on('reconnect', refreshAfterConnect);

    if (socket.connected) {
      refreshAfterConnect();
    }

    return () => {
      socket.off('chat:event', handleChatEvent);
      socket.off('contact:event', handleContactEvent);
      socket.off('error', handleSocketError);
      socket.off('connect', refreshAfterConnect);
      socket.off('reconnect', refreshAfterConnect);
      setSocket(null);
    };
  }, [
    socket,
    user,
    setSocket,
    setConversations,
    setMessages,
    addMessage,
    updateConversation,
    removeConversationBychat_id,
    addConversation,
    setTyping,
    clearTyping,
    loadConversations,
    setContacts,
    upsertContact,
    removeContact,
  ]);

  return null;
};

export default WebSocketEvents;
