// src/components/WebSocketEvents.tsx
'use client';

import { useEffect } from 'react';
import { useSocket } from '@/contexts/SocketProvider';
import { useChatStore } from '@/store/chatStore';
import { useAuth } from '@/contexts/AuthProvider';
import { Conversation, Message, transformToConversation, transformToMessage } from '@/types/chat';


const WebSocketEvents = () => {
  const { socket } = useSocket();
  const {
    setSocket,
    setConversations,
    setMessages,
    addMessage,
    updateConversation,
    removeConversationBychat_id,
    addConversation,
    loadConversations,

    updateMessageStatus,
    setTyping,
    clearTyping,
  } = useChatStore();
  const { user } = useAuth();

  useEffect(() => {
    if (socket && user) {
      // Injecte le socket dans le store pour un accès global
      setSocket(socket);

      // Charge les conversations initiales une fois la connexion établie
      loadConversations();

      // --- Définition des handlers ---

      const handleConversationAssigned = (data: { conversation: any }) => {
        console.log("================================bien recu==============================", data);

        const conversation = transformToConversation(data.conversation);
        addConversation(conversation);
      };

      const handleConversationRemoved = (data: { chat_id: string }) => {
        removeConversationBychat_id(data.chat_id);
      };

      const handleConversationsList = (rawConversations: any[]) => {
        console.log('Received raw conversations list:', rawConversations);
        const conversations = rawConversations.map(transformToConversation);
        setConversations(conversations);
      };

      const handleChatEvent = (data: { type: string; payload: any }) => {
        // console.log("message reçu de event:",data.type, data);

        switch (data.type) {
          case 'MESSAGE_ADD': {

            console.log("messate+++===============");

            const message: Message = transformToMessage(data.payload);
            const tempId = (data.payload as any).tempId;

            console.log("messate+++===============", tempId);

            // Si tempId existe, on peut remplacer le message temporaire
            if (tempId) {
              const idx = useChatStore.getState().messages.findIndex((m) => m.id === tempId);
              console.log("messate tmp.id===============", idx);

              if (idx > -1) {
                const updatedMessages = [...useChatStore.getState().messages];
                updatedMessages[idx] = message;
                useChatStore.getState().setMessages(message.chat_id, updatedMessages);
                break;
              }
            }

            // Sinon, on ajoute normalement
            addMessage(message);
            break;
          }

          case 'CONVERSATION_UPSERT': {
            const conversation: Conversation = transformToConversation(data.payload);
            console.log("======conversation update,", conversation);

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

          case 'AUTO_MESSAGE_STATUS':
            updateConversation({
              chat_id: data.payload.chat_id,
              auto_message_status: data.payload.status,
            });
            break;

          case 'CONVERSATION_LIST': {
            const conversations: Conversation[] = data.payload.map(transformToConversation);
            setConversations(conversations);
            break;
          }

          case 'CONVERSATION_ASSIGNED': {
            const conversation: Conversation = transformToConversation(data.payload);
            addConversation(conversation);
            break;
          }

          case 'CONVERSATION_REASSIGNED': {
            const conversation: Conversation = transformToConversation(data.payload);
            updateConversation(conversation);
            break;
          }

          case 'CONVERSATION_READONLY': {
            const conversation: Conversation = transformToConversation(data.payload);
            updateConversation({ ...conversation, readonly: true } as any);
            break;
          }

          case 'MESSAGE_STATUS': {
            const { chat_id, message_id, status } = data.payload;
            const allowedStatuses = ["sending", "sent", "delivered", "read", "error"] as const;
            if (allowedStatuses.includes(status)) {
              updateMessageStatus(chat_id, message_id, status as any);
            }
            break;
          }

          default:
            console.warn('Unhandled chat event type:', data.type, data.payload);
        }
      };


      const handleError = (error: { message: string, details?: string }) => {
        console.error('Socket error received:', error.message, error.details || '');
      };

      const handleTypingStart = (data: { chat_id: string, commercial_id: string }) => {
        if (data.commercial_id === user.id) return;
        setTyping(data.chat_id);
      };

      const handleTypingStop = (data: { chat_id: string, commercial_id: string }) => {
        if (data.commercial_id === user.id) return;
        clearTyping(data.chat_id);
      };


      // --- Enregistrement des listeners ---
      socket.on('chat:event', handleChatEvent);
      socket.on('typing:start', handleTypingStart);
      socket.on('typing:stop', handleTypingStop);
      socket.on('error', handleError);

      // --- Nettoyage ---
      return () => {
        socket.off('chat:event', handleChatEvent);
        socket.off('typing:start', handleTypingStart);
        socket.off('typing:stop', handleTypingStop);
        socket.off('error', handleError);
        setSocket(null);
      };
    }
  }, [socket, user, setSocket, loadConversations, setConversations, setMessages, addMessage, updateConversation, addConversation, removeConversationBychat_id, updateMessageStatus, setTyping, clearTyping]);

  return null; // Ce composant ne rend rien
};

export default WebSocketEvents;