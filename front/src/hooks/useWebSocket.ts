
import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

import { Conversation } from '@/types/chat';

export const useWebSocket = (token: string | null) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);

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
    (event: string, data: any) => {
      if (socket) {
        socket.emit(event, data);
      }
    },
    [socket],
  );

  return { socket, isConnected, emit, conversations, setConversations };
};
