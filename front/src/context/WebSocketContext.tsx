'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthProvider';
import { Socket } from 'socket.io-client';

interface WebSocketContextProps {
  socket: Socket | null;
}

const WebSocketContext = createContext<WebSocketContextProps>({
  socket: null,
});

export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (token) {
      const newSocket = io('http://localhost:3001', {
        auth: {
          token: `Bearer ${token}`
        }
      });
      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [token]);

  return (
    <WebSocketContext.Provider value={socket}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);
