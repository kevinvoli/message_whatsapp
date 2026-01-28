// src/components/WebSocketEvents.tsx
'use client';

import { useEffect } from 'react';
import { useSocket } from '@/contexts/SocketProvider';
import { useChatStore } from '@/store/chatStore';
import { useAuth } from '@/contexts/AuthProvider';
import { Conversation, Message, transformToConversation, transformToMessage } from '@/types/chat';

/**
 * @file WebSocketEvents.tsx
 * @description Ce composant (sans UI) agit comme un pont entre le contexte Socket.io et le store Zustand.
 * Il écoute les événements WebSocket entrants et appelle les actions correspondantes du store pour mettre à jour l'état de l'application.
 * Cela permet de centraliser toute la logique d'écoute des événements en un seul endroit,
 * en gardant les composants UI propres et découplés de la logique WebSocket.
 */
const WebSocketEvents = () => {
  const { socket } = useSocket();
  const {
    setSocket,
    setConversations,
    setMessages,
    addMessage,
    updateConversation,
    removeConversationByChatId,
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

      const handleConversationRemoved = (data: { chatId: string }) => {
        removeConversationByChatId(data.chatId);
      };

      const handleConversationsList = (rawConversations: any[]) => {
        console.log('Received raw conversations list:', rawConversations);
        const conversations = rawConversations.map(transformToConversation);
        setConversations(conversations);
      };

      const handleMessagesList = (data: { chatId: string, messages: any[] }) => {
        console.log(`Received raw messages for chat ${data.chatId}:`, data.messages);
        const messages = data.messages.map(transformToMessage);
        setMessages(data.chatId, messages);
      };

      const handleNewMessage = (rawMessage: any) => {
        console.log('Received raw new message:ccccccccccccccccccccccccccccccccccccccccccccccccccccccc', rawMessage);
        const message = transformToMessage(rawMessage);
        addMessage(message);
      };

      const handleConversationUpdated = (rawConversation: any) => {
        console.log('Received raw conversation update:', rawConversation);
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
        updateMessageStatus(data.conversationId, data.messageId, data.status);
      };

      const handleTypingStart = (data: { conversationId: string }) => {
        console.log(`Typing started in chat ${data.conversationId}`);
        setTyping(data.conversationId);
      };

      const handleTypingStop = (data: { conversationId: string }) => {
        console.log(`Typing stopped in chat ${data.conversationId}`);
        clearTyping(data.conversationId);
      };


      // --- Enregistrement des listeners ---
      socket.on('conversations:list', handleConversationsList);
      socket.on('messages:list', handleMessagesList);
      socket.on('message:new', handleNewMessage);
      socket.on('conversation:updated', handleConversationUpdated);
      socket.on('message:status:update', handleMessageStatusUpdate);
      socket.on('typing:start', handleTypingStart);
      socket.on('typing:stop', handleTypingStop);
      socket.on('error', handleError);
      socket.on('conversation:assigned', handleConversationAssigned);
      socket.on('conversation:removed', handleConversationRemoved);
      // --- Nettoyage ---
      return () => {
        socket.off('conversations:list', handleConversationsList);
        socket.off('messages:list', handleMessagesList);
        socket.off('message:new', handleNewMessage);
        socket.off('conversation:updated', handleConversationUpdated);
        socket.off('error', handleError);
        setSocket(null);
      };
    }
  }, [socket, user, setSocket, loadConversations, setConversations, setMessages, addMessage, updateConversation, addConversation, removeConversationByChatId]);

  return null; // Ce composant ne rend rien
};

export default WebSocketEvents;