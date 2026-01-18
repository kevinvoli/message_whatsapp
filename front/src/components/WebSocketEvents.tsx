// src/components/WebSocketEvents.tsx
'use client';

import { useEffect } from 'react';
import { useSocket } from '@/contexts/SocketProvider';
import { useChatStore } from '@/store/chatStore';
import { useAuth } from '@/contexts/AuthProvider';
import { Conversation, Message } from '@/types/chat';

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
      const handleConversationsList = (conversations: Conversation[]) => {
        console.log('Received conversations list:', conversations);
        setConversations(conversations);
      };

      const handleMessagesList = (data: { chatId: string, messages: Message[] }) => {
        console.log(`Received messages for chat ${data.chatId}:`, data.messages);
        setMessages(data.chatId, data.messages);
      };

      const handleNewMessage = (message: Message) => {
        console.log('Received new message:', message);
        addMessage(message);
      };

      const handleConversationUpdated = (conversation: Conversation) => {
        console.log('Conversation updated:', conversation);
        updateConversation(conversation);
      };

      const handleError = (error: { message: string, details?: string }) => {
        console.error('Socket error received:', error.message, error.details || '');
      };

      // --- Enregistrement des listeners ---
      socket.on('conversations:list', handleConversationsList);
      socket.on('messages:list', handleMessagesList);
      socket.on('message:new', handleNewMessage);
      socket.on('conversation:updated', handleConversationUpdated);
      socket.on('error', handleError);

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
  }, [socket, user, setSocket, loadConversations, setConversations, setMessages, addMessage, updateConversation]);

  return null; // Ce composant ne rend rien
};

export default WebSocketEvents;
