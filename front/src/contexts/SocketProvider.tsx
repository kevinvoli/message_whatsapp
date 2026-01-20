// src/contexts/SocketProvider.tsx
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthProvider';
import { Commercial } from '@/types/chat';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => {
  return useContext(SocketContext);
};

const socketUrl = `${process.env.NEXT_PUBLIC_SOCKET_URL}`;

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth() as { user: Commercial | null };
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (user?.id) {
      const newSocket = io(socketUrl, {
        transports: ['websocket'],
        auth: {
          commercialId: user.id,
        },
      });

      setSocket(newSocket);

      newSocket.on('connect', () => setIsConnected(true));
      newSocket.on('disconnect', () => setIsConnected(false));

      // Cleanup on component unmount or user change
      return () => {
        newSocket.disconnect();
        setSocket(null);
      };
    } else if (socket) {
      // If user logs out, disconnect the existing socket
      socket.disconnect();
      setSocket(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    socket,
    isConnected,
  }), [socket, isConnected]);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};
