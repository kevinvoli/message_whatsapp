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

          case 'CONVERSATION_REASSIGNED': {
            const conversation: Conversation = transformToConversation(data.payload);
            updateConversation(conversation);
            break;
          }

          case 'CONVERSATION_READONLY': {
            const conversation: Conversation = transformToConversation(data.payload);
            updateConversation({ ...conversation, readonly: true });
            break;
          }

          default:
            console.warn('Unhandled chat event type:', data.type, data.payload);
        }
      };


      const handleMessagesList = (data: { chat_id: string, messages: any[] }) => {
        console.log(`Received raw messages for chat ${data.chat_id}:`, data.messages);
        const messages = data.messages.map(transformToMessage);
        setMessages(data.chat_id, messages);
      };

      const handleNewMessage = (rawMessage: any) => {
        console.log('Received raw new message:ccccccccccccccccccccccccccccccccccccccccccccccccccccccc', rawMessage);
        const message = transformToMessage(rawMessage);
        addMessage(message);
      };

      const handleConversationUpdated = (rawConversation: any) => {
        console.log('Received raw conversation update=======:', rawConversation);
        const conversation = transformToConversation(rawConversation);
        updateConversation(conversation);
      };

      const handleError = (error: { message: string, details?: string }) => {
        console.error('Socket error received:', error.message, error.details || '');
      };

      const handleMessageStatusUpdate = (data: {
        conversationId: string;
        messageId: string;
        status: string;
      }) => {
        console.log(`Received status update for message ${data.messageId}: ${data.status}`);
        const allowedStatuses = ["sending", "sent", "delivered", "read", "error"] as const;

        if (allowedStatuses.includes(data.status as any)) {
          updateMessageStatus(
            data.conversationId,
            data.messageId,
            data.status as typeof allowedStatuses[number]
          );
        } else {
          console.warn(`Received unknown status: ${data.status}`);
        }
      };

      const handleTypingStart = (data: { chat_id: string,commercial_id:string }) => {
        console.log(`Typing started in chat date: ${data}`,data);
          if (data.commercial_id === user.id) return; 
        setTyping(data.chat_id);
      };

      const handleTypingStop = (data: { chat_id: string,commercial_id:string }) => {
        console.log(`Typing stopped in chat ${data}`);
        if (data.commercial_id === user.id) return;
        clearTyping(data.chat_id);
      };

      const handleConversationReassigned = (data: {
        chat_id: string;
        oldPosteId: string;
        newPosteId: string;
      }) => {
        console.log('Conversation reassigned:', data);
        // Ici tu peux mettre à jour le store pour refléter le changement d'agent
        updateConversation({
          chat_id: data.chat_id,
          status: 'actif',
        });
      };

      const handleConversationReadonly = (data: { chat_id: string }) => {
        console.log('Conversation readonly:', data);
        // Tu peux ajouter un flag dans le store pour bloquer l’édition côté UI
        updateConversation({
          chat_id: data.chat_id,
          readonly: true,
        });
      };


      // --- Enregistrement des listeners ---
      socket.on('chat:event', handleChatEvent);
      socket.on('conversations:list', handleConversationsList);
      socket.on('messages:list', handleMessagesList);
      socket.on('message:new', handleNewMessage);
      socket.on('conversation:updated', handleConversationUpdated);
      socket.on('message:status:update', handleMessageStatusUpdate);
      socket.on('typing:start', handleTypingStart);
      socket.on('typing:stop', handleTypingStop);
      socket.on('error', handleError);
      // socket.on('conversation:assigned', handleConversationAssigned);
      socket.on('conversation:removed', handleConversationRemoved);
      socket.on('conversation:reassigned', handleConversationReassigned);
      socket.on('conversation:readonly', handleConversationReadonly);
      // --- Nettoyage ---
      return () => {
        socket.off('chat:event', handleChatEvent);
        socket.off('conversations:list', handleConversationsList);
        socket.off('messages:list', handleMessagesList);
        socket.off('conversation:reassigned', handleConversationReassigned);
        socket.off('conversation:readonly', handleConversationReadonly);
        socket.off('message:new', handleNewMessage);
        socket.off('conversation:updated', handleConversationUpdated);
        socket.off('error', handleError);
        setSocket(null);
      };
    }
  }, [socket, user, setSocket, loadConversations, setConversations, setMessages, addMessage, updateConversation, addConversation, removeConversationBychat_id, updateMessageStatus, setTyping, clearTyping]);

  return null; // Ce composant ne rend rien
};

export default WebSocketEvents;