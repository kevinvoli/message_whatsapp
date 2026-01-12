'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Commercial, WebSocketMessage, Message, Conversation } from '@/types/chat';

interface WebSocketMessageData {
  conversationId: string;
  message: Message;
}

interface WebSocketError {
  error: string;
}

export const useWebSocket = (commercial: Commercial | null) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (!commercial) return;

    console.log('🔄 Tentative de connexion WebSocket...');
    
    const socket = io('http://localhost:3000', {
      transports: ['websocket', 'polling'],
      auth: {
        commercialId: commercial.id,
        token: localStorage.getItem('token'),
      },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('🟢 Connecté au socket avec ID:', socket.id);
      setIsConnected(true);
      setError(null);
      
      // Joindre la room du commercial
      socket.emit('join:commercial', { commercialId: commercial.id });
    });

    socket.on('disconnect', (reason) => {
      console.log('🔴 Déconnecté:', reason);
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        // Reconnexion manuelle nécessaire
        setTimeout(() => socket.connect(), 1000);
      }
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Erreur de connexion:', err.message);
      setError(`Erreur de connexion: ${err.message}`);
      setIsConnected(false);
    });

    socket.on('error', (data: WebSocketError) => {
      console.error('❌ Erreur WebSocket:', data.error);
      setError(data.error);
    });

    socket.on('message:received', (data: WebSocketMessageData) => {
      console.log('📩 Message reçu en temps réel:', data);
      setLastMessage(data);
    });

    socket.on('message:sent', (data: WebSocketMessageData) => {
      console.log('✅ Message envoyé confirmé:', data);
      setLastMessage(data);
    });

    socket.on('conversation:updated', (data: Conversation) => {
      console.log('🔄 Conversation mise à jour:', data);
    });

    socket.on('typing:start', (data: { conversationId: string; userId: string }) => {
      console.log('✍️ L\'utilisateur est en train d\'écrire:', data);
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      console.log('⏹️ L\'utilisateur a arrêté d\'écrire:', data);
    });

    socketRef.current = socket;

    return socket;
  }, [commercial]);

  useEffect(() => {
    const socket = connect();

    return () => {
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
    };
  }, [connect]);

  const sendMessage = useCallback((messageData: WebSocketMessageData) => {
    if (socketRef.current && isConnected) {
      console.log('📤 Envoi du message via WebSocket:', messageData);
      socketRef.current.emit('agent:message', messageData);
      return true;
    }
    console.warn('⚠️ WebSocket non connecté, message non envoyé');
    return false;
  }, [isConnected]);

  const joinConversation = useCallback((conversationId: string) => {
    if (socketRef.current && isConnected && commercial) {
      console.log(`🚪 Rejoindre la conversation: ${conversationId}`);
      socketRef.current.emit('join:conversation', {
        conversationId,
        commercialId: commercial.id,
      });
      return true;
    }
    return false;
  }, [isConnected, commercial]);

  const leaveConversation = useCallback((conversationId: string) => {
    if (socketRef.current && isConnected) {
      console.log(`🚪 Quitter la conversation: ${conversationId}`);
      socketRef.current.emit('leave:conversation', { conversationId });
      return true;
    }
    return false;
  }, [isConnected]);

  const startTyping = useCallback((conversationId: string) => {
    if (socketRef.current && isConnected && commercial) {
      socketRef.current.emit('typing:start', {
        conversationId,
        userId: commercial.id,
      });
      return true;
    }
    return false;
  }, [isConnected, commercial]);

  const stopTyping = useCallback((conversationId: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('typing:stop', { conversationId });
      return true;
    }
    return false;
  }, [isConnected]);

  const reconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.connect();
    }
  }, []);

  return {
    isConnected,
    lastMessage,
    error,
    socket: socketRef.current,
    sendMessage,
    joinConversation,
    leaveConversation,
    startTyping,
    stopTyping,
    reconnect,
  };
};


































// 'use client';

// import { useEffect, useRef, useState } from 'react';
// import { io, Socket } from 'socket.io-client';
// import { Commercial, WebSocketMessage } from '@/types/chat';

// export const useWebSocket = (commercial: Commercial | null) => {
//   const socketRef = useRef<Socket | null>(null);
//   const [isConnected, setIsConnected] = useState(false);

//   useEffect(() => {
//     if (!commercial) return;

//     const socket = io(
//        'http://localhost:3000',
//       {
//         transports: ['websocket'],
//         auth: {
//           commercialId: commercial.id,
//         },
//       }
//     );
    

//     socket.on('connect', () => {
//       console.log('🟢 Connecté au socket', socket.id);
//       setIsConnected(true);
//     });

//     socket.on('disconnect', () => {
//       console.log('🔴 Déconnecté');
//       setIsConnected(false);
//     });

//     socket.on('message', (data: WebSocketMessage) => {
//       console.log('📩 Message reçu:', data);
//     });

//     socketRef.current = socket;

//     return () => {
//       socket.disconnect();
//       socketRef.current = null;
//     };
//   }, [commercial]);

//   const sendMessage = (message: WebSocketMessage) => {
//     if (socketRef.current && isConnected) {
//       socketRef.current.emit('agent:message', message);
//       return true;
//     }
//     return false;
//   };

//   return { isConnected, sendMessage };
// };
