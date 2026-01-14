
'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useAuthContext } from './AuthProvider';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Socket } from 'socket.io-client';

interface WebSocketContextProps {
  socket: Socket | null;
  isConnected: boolean;
  emit: (event: string, data: any) => void;
}

const WebSocketContext = createContext<WebSocketContextProps | null>(null);

export const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const { token } = useAuthContext();
  const { socket, isConnected, emit } = useWebSocket(token);

  return (
    <WebSocketContext.Provider value={{ socket, isConnected, emit }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};
