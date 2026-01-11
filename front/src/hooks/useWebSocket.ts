import { useState, useCallback, useEffect, useRef } from 'react';
import { Commercial, WebSocketMessage } from '@/types/chat';

export const useWebSocket = (commercial: Commercial | null) => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!commercial) return;

    const ws = new WebSocket('wss://votre-serveur.com/ws');
    
    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({
        type: 'auth',
        commercialId: commercial.id,
        token: commercial.token
      }));
    };

    ws.onmessage = (event) => {
      const data: WebSocketMessage = JSON.parse(event.data);
      // Ici vous pouvez gérer les différents types de messages
      // Pour l'instant on retourne juste les données
      return data;
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Utiliser setTimeout directement avec une fonction fléchée
      setTimeout(() => {
        if (commercial) {
          const reconnect = () => {
            if (commercial) {
              const newWs = new WebSocket('wss://votre-serveur.com/ws');
              newWs.onopen = () => setIsConnected(true);
              newWs.onerror = () => setIsConnected(false);
              newWs.onclose = () => {
                setTimeout(reconnect, 3000);
              };
              wsRef.current = newWs;
            }
          };
          reconnect();
        }
      }, 3000);
    };

    wsRef.current = ws;
  }, [commercial]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (commercial) {
      connect();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [commercial, connect]);

  return { isConnected, sendMessage };
};