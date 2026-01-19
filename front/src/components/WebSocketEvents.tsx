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
    addConversation,
    removeConversation,
    loadConversations,
  } = useChatStore();
  const { user } = useAuth();

  useEffect(() => {
    if (socket && user) {
      // Injecte le socket dans le store pour un accès global
      setSocket(socket);

      // Charge les conversations initiales une fois la connexion établie
      loadConversations();

      // --- Définition des handlers ---
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

      const handleNewMessage = (data: { conversationId: string, message: any }) => {
        console.log('Received raw new message for conversation:', data.conversationId, data.message);
        const message = transformToMessage(data.message);
        addMessage(message);
      };

      const handleConversationUpdated = (rawConversation: any) => {
        console.log('Received raw conversation update:', rawConversation);
        const conversation = transformToConversation(rawConversation);
        updateConversation(conversation);
      };

      const handleNewConversation = (rawConversation: any) => {
        console.log('Received new conversation:', rawConversation);
        const conversation = transformToConversation(rawConversation);
        addConversation(conversation);
      };

      const handleConversationRemoved = (conversationId: string) => {
        console.log('Received conversation removal:', conversationId);
        removeConversation(conversationId);
      };

      const handleError = (error: { message: string, details?: string }) => {
        console.error('Socket error received:', error.message, error.details || '');
      };

      // --- Enregistrement des listeners ---
      socket.on('conversations:list', handleConversationsList);
      socket.on('messages:list', handleMessagesList);
      socket.on('message:received', handleNewMessage);
      socket.on('conversation:updated', handleConversationUpdated);
      socket.on('conversation:new', handleNewConversation);
      socket.on('conversation:removed', handleConversationRemoved);
      socket.on('error', handleError);
      // --- Nettoyage ---
      return () => {
        socket.off('conversations:list', handleConversationsList);
        socket.off('messages:list', handleMessagesList);
        socket.off('message:received', handleNewMessage);
        socket.off('conversation:updated', handleConversationUpdated);
        socket.off('conversation:new', handleNewConversation);
        socket.off('conversation:removed', handleConversationRemoved);
        socket.off('error', handleError);
        setSocket(null);
      };
    }
  }, [socket, user, setSocket, loadConversations, setConversations, setMessages, addMessage, updateConversation]);

  return null; // Ce composant ne rend rien
};

export default WebSocketEvents;
