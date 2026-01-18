// src/components/WebSocketEvents.tsx
'use client';

import { useEffect } from 'react';
import { useSocket } from '@/contexts/SocketProvider';
import { useChatStore } from '@/store/chatStore';
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
  const { addMessage, updateConversation, addConversation } = useChatStore();

  useEffect(() => {
    if (!socket) return;

    // Listener pour les nouveaux messages
    const handleNewMessage = (message: Message) => {
      console.log('Received new message:', message);
      addMessage(message);
    };

    // Listener pour la mise à jour d'une conversation (ex: changement de statut, nouveau message)
    const handleConversationUpdated = (conversation: Conversation) => {
      console.log('Conversation updated:', conversation);
      updateConversation(conversation);
    };

    // Listener pour une nouvelle conversation assignée
    const handleNewConversation = (conversation: Conversation) => {
        console.log('New conversation assigned:', conversation);
        addConversation(conversation); // Ajoute la nouvelle conversation au store
      };


    socket.on('message:new', handleNewMessage);
    socket.on('conversation:updated', handleConversationUpdated);
    socket.on('conversation:new', handleNewConversation);


    // Nettoyage des listeners lors du démontage du composant
    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('conversation:updated', handleConversationUpdated);
      socket.off('conversation:new', handleNewConversation);
    };
  }, [socket, addMessage, updateConversation, addConversation]);

  return null; // Ce composant ne rend rien
};

export default WebSocketEvents;
