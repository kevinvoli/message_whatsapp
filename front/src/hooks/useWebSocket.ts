
import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

import { Conversation, Message } from '@/types/chat';

export const useWebSocket = (token: string | null) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      const newSocket = io(SOCKET_URL, {
        auth: {
          token,
        },
      });

      newSocket.on('connect', () => {
        setIsConnected(true);
        console.log('WebSocket connected');
      });

      newSocket.on('disconnect', () => {
        setIsConnected(false);
        console.log('WebSocket disconnected');
      });

      newSocket.on('conversation:list', (data: Conversation[]) => {
        setConversations(data);
      });

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
      };
    }
  }, [token]);

  const emit = useCallback(
    <T>(event: string, data: T) => {
      if (socket) {
        socket.emit(event, data);
      }
    },
    [socket],
  );

  useEffect(() => {
    if (socket) {
      socket.on('message:received', (message: Message) => {
        setMessages((prevMessages) => [...prevMessages, message]);
      });

      socket.on('messages:get', (messages: Message[]) => {
        setMessages(messages);
      });
    }

    return () => {
      if (socket) {
        socket.off('message:received');
        socket.off('messages:get');
      }
    };
  }, [socket]);

  return {
    socket,
    isConnected,
    emit,
    conversations,
    setConversations,
    messages,
    setMessages,
    selectedConversationId,
    setSelectedConversation: setSelectedConversationId,
    reconnect: () => {
      if (socket) {
        socket.disconnect();
        socket.connect();
      }
    },
    joinConversation: (conversationId: string) => {
      emit('join:conversation', { conversationId });
      return true;
    },
    leaveConversation: (conversationId: string) => {
      emit('leave:conversation', { conversationId });
    },
    loadConversation: (commercialId: string) => {
      emit('get:conversation', { agentId: commercialId });
    },
    loadMessages: (conversationId: string) => {
      emit('get:messages', { conversationId });
    },
    sendMessage: (message: { conversationId: string; content: string; author: string; chat_id: string }) => {
      emit('agent:message', message);
      return true;
    },
  };
};
