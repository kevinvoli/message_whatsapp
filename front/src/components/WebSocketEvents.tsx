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
 * Il écoute les événements WebSocket entrants, transforme les données brutes du backend,
 * et appelle les actions correspondantes du store pour mettre à jour l'état de l'application.
 */
const WebSocketEvents = () => {
  const { socket } = useSocket();
  const {
    setSocket,
    setConversations,
    setMessages,
    addMessage,
    updateConversation,
    loadConversations,
  } = useChatStore();
  const { user } = useAuth();

  useEffect(() => {
    if (socket && user) {
      setSocket(socket);
      loadConversations();

      // --- Définition des handlers ---
      const handleConversationsList = (rawConversations: any[]) => {
        const conversations = rawConversations.map(transformToConversation);
        setConversations(conversations);
      };

      const handleMessagesList = (data: { chatId: string, messages: any[] }) => {
        const messages = data.messages.map(transformToMessage);
        setMessages(data.chatId, messages);
      };

      const handleConversationUpdated = (rawConversation: any) => {
        const conversation = transformToConversation(rawConversation);
        updateConversation(conversation);
      };

      const handleError = (error: { message: string, details?: string }) => {
        console.error('Socket error received:', error.message, error.details || '');
      };

      // --- Enregistrement des listeners ---
      socket.on('conversations:list', handleConversationsList);
      socket.on('messages:list', handleMessagesList);
      socket.on('conversation:updated', handleConversationUpdated);
      socket.on('error', handleError);

      // --- Nettoyage ---
      return () => {
        socket.off('conversations:list', handleConversationsList);
        socket.off('messages:list', handleMessagesList);
        socket.off('conversation:updated', handleConversationUpdated);
        socket.off('error', handleError);
        setSocket(null);
      };
    }
  }, [socket, user, setSocket, loadConversations, setConversations, setMessages, addMessage, updateConversation]);

  return null; // Ce composant ne rend rien
};

export default WebSocketEvents;
