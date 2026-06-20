'use client';

/**
 * TICKET-08-C — Orchestrateur d'événements WebSocket.
 *
 * Ce composant ne contient aucune logique métier inline.
 * Il connecte le socket aux handlers du routeur d'événements
 * (`socket-event-router.ts`) et aux stores.
 *
 * Ajouter un nouvel événement socket = ajouter un handler dans
 * `modules/realtime/services/socket-event-router.ts`.
 */

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useSocket } from '@/contexts/SocketProvider';
import { useChatStore } from '@/store/chatStore';
import { useContactStore } from '@/store/contactStore';
import { Commercial, Message } from '@/types/chat';
import {
  handleChatEvent,
  handleContactEvent,
  handleSocketError,
  handleQueueUpdated,
} from '@/modules/realtime/services/socket-event-router';

interface MessageSendErrorPayload {
  tempId?: string;
  code?: string;
  message?: string;
}

const WebSocketEvents = () => {
  const { socket } = useSocket();
  const { user } = useAuth() as { user: Commercial | null };

  const setSocket = useChatStore((s) => s.setSocket);
  const setContactSocket = useContactStore((s) => s.setSocket);
  const loadConversations = useChatStore((s) => s.loadConversations);

  useEffect(() => {
    if (!socket || !user) return;

    setSocket(socket);
    setContactSocket(socket);

    const refreshAfterConnect = () => {
      loadConversations();
      socket.emit('contacts:get');
      const selectedChatId = useChatStore.getState().selectedConversation?.chat_id;
      if (selectedChatId) socket.emit('messages:get', { chat_id: selectedChatId });
      // Restaurer l'état de restriction au (re)connect : sans ça, restrictionTriggered
      // repart à false après F5 / second onglet et le commercial contourne le blocage.
      socket.emit('restriction:check');
    };

    const onChatEvent = (data: Parameters<typeof handleChatEvent>[0]) =>
      handleChatEvent(data, socket, user.id);
    const onContactEvent = (data: Parameters<typeof handleContactEvent>[0]) =>
      handleContactEvent(data);

    const onMessageSendError = (data: MessageSendErrorPayload) => {
      const chatState = useChatStore.getState();
      if (data.tempId) {
        const next: Message[] = chatState.messages.map((msg) =>
          msg.id === data.tempId ? { ...msg, status: 'error' as const } : msg,
        );
        const selectedChatId = chatState.selectedConversation?.chat_id;
        if (selectedChatId) chatState.setMessages(selectedChatId, next);
      }
      if (data.code === 'RESTRICTION_TRIGGERED' && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('restriction:triggered', {
            detail: { message: data.message },
          }),
        );
      }
    };

    socket.on('chat:event', onChatEvent);
    socket.on('contact:event', onContactEvent);
    socket.on('error', handleSocketError);
    socket.on('connect', refreshAfterConnect);
    socket.on('queue:updated', handleQueueUpdated);
    socket.on('MESSAGE_SEND_ERROR', onMessageSendError);

    if (socket.connected) refreshAfterConnect();

    return () => {
      socket.off('chat:event', onChatEvent);
      socket.off('contact:event', onContactEvent);
      socket.off('error', handleSocketError);
      socket.off('connect', refreshAfterConnect);
      socket.off('queue:updated', handleQueueUpdated);
      socket.off('MESSAGE_SEND_ERROR', onMessageSendError);
      setSocket(null);
      setContactSocket(null);
    };
  }, [socket, user, setSocket, setContactSocket, loadConversations]);

  return null;
};

export default WebSocketEvents;
