'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthProvider';

const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (token) {
      const newSocket = io('http://localhost:3000', {
        auth: {
          token: `Bearer ${token}`
        }
      });
      setSocket(newSocket);

      return () => newSocket.close();
    }
  }, [token]);

  return (
    <WebSocketContext.Provider value={socket}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);
