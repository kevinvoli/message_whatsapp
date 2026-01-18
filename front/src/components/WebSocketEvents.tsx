// src/components/WebSocketEvents.tsx
'use client';

import { useEffect } from 'react';
import { useSocket } from '@/contexts/SocketProvider';
import { useChatStore } from '@/stores/useChatStore'; // CORRIGÉ : Import du store unifié
import { useAuth } from '@/contexts/AuthProvider';
import { transformToConversation, transformToMessage } from '@/types/chat';

/**
 * @file WebSocketEvents.tsx
 * @description Ce composant (sans UI) agit comme un pont entre le contexte Socket.io et le store Zustand.
 * Il écoute les événements WebSocket entrants, transforme les données brutes du backend,
 * et appelle les actions correspondantes du store pour mettre à jour l'état de l'application.
 */
const WebSocketEvents = () => {
  const { socket } = useSocket();
  const { user } = useAuth();
  // Actions du store pour mettre à jour l'état
  const {
    setConversations,
    setMessages,
    updateConversation,
    setError,
  } = useChatStore();

  useEffect(() => {
    if (socket && user) {
      // Demande la liste initiale des conversations au chargement
      socket.emit('conversations:get');

      // --- Définition des handlers ---
      const handleConversationsList = (rawConversations: any[]) => {
        const conversations = rawConversations.map(transformToConversation);
        setConversations(conversations);
      };

      const handleMessagesList = (data: { chatId: string, messages: any[] }) => {
        // Récupère l'état le plus récent du store pour éviter les "stale closures"
        const { selectedConversation } = useChatStore.getState();

        // Met à jour les messages uniquement si la liste reçue correspond à la conversation ouverte
        if (selectedConversation?.chatId === data.chatId) {
          const messages = data.messages.map(transformToMessage);
          setMessages(messages);
        }
      };

      const handleConversationUpdated = (rawConversation: any) => {
        const conversation = transformToConversation(rawConversation);
        updateConversation(conversation);
      };

      const handleError = (error: { message: string, details?: string }) => {
        const errorMessage = `Socket error: ${error.message}${error.details ? ` (${error.details})` : ''}`;
        console.error(errorMessage);
        setError(errorMessage);
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
      };
    }
  }, [socket, user, setConversations, setMessages, updateConversation, setError]);

  return null; // Ce composant ne rend rien
};

export default WebSocketEvents;
