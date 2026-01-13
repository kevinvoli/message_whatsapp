"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { Commercial, Conversation, WebSocketMessage } from "@/types/chat";

interface WebSocketError {
  error: string;
}

export const useWebSocket = (commercial: Commercial | null) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
    const [conversations, setConversations] = useState<Conversation[]>([]);
  
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (!commercial) return null;

    console.log("🔄 Tentative de connexions WebSocket...", commercial);

  if (!commercial) return null;

    console.log("🔄 Tentative de connexion WebSocket...", commercial);

    const socket = io("http://localhost:3000", {
      transports: ["websocket", "polling"],
      auth: {
        commercialId: commercial.id,
        token: typeof window !== "undefined" ? localStorage.getItem("token") : null,
      },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      console.log("🟢 Connecté au socket");
      setIsConnected(true);
      setError(null);

      // CORRECTION: Envoyer l'événement correct avec le bon nom de champ
      socket.emit("get:conversation", {
        agentId: commercial.id, // Changé de commercialId à agentId
      });
    });

    socket.on("disconnect", (reason) => {
      console.log("🔴 Déconnecté:", reason);
      setIsConnected(false);
      if (reason === "io server disconnect") {
        // Reconnexion manuelle nécessaire
        setTimeout(() => socket.connect(), 1000);
      }
    });

    //  ecoute des erreurs
    socket.on("connect_error", (err) => {
      console.error("❌ Erreur de connexion:", err.message);
      setError(`Erreur de connexion: ${err.message}`);
      setIsConnected(false);
    });

    socket.on("error", (data: WebSocketError) => {
      console.error("❌ Erreur WebSocket:", data.error);
      setError(data.error);
    });

    // Écoute des messages entrants

    socket.on("message:received", (data: WebSocketMessage) => {
      console.log("📩 Message reçu en temps réel:", data);
      setLastMessage(data);
    });

    socket.on("conversation:list", (data: any) => {
      console.log("📩 Liste des conversations reçue:", data);
      if (data.conversations) {
        setConversations(data.conversations as Conversation[]);
      }
      setConversations(data.conversations as Conversation[]);
    });

    socket.on("message:sent", (data: WebSocketMessage) => {
      console.log("✅ Message envoyé confirmé:", data);
      setLastMessage(data);
    });

    socket.on(
      "typing:start",
      (data: { conversationId: string; userId: string }) => {
        console.log("✍️ L'utilisateur est en train d'écrire:", data);
      }
    );

    socket.on("typing:stop", (data: { conversationId: string }) => {
      console.log("⏹️ L'utilisateur a arrêté d'écrire:", data);
    });

     socket.on("conversation:get", (data: any) => {
      console.log("🚪 Liste des conversations reçue:", data);
      
      // Transformer les données du backend en format frontend
      if (data && Array.isArray(data)) {
        const transformedConversations = data.map((chat: any) => ({
          id: chat.id,
          chat_id: chat.chat_id,
          clientName: chat.name,
          clientPhone: chat.chat_id.split('@')[0], // Extraction du numéro du chat_id
          lastMessage: {
            text: chat.messages?.[chat.messages.length - 1]?.text || "Aucun message",
            timestamp: new Date(chat.updatedAt),
            author: 'client'
          },
          unreadCount: parseInt(chat.unread_count) || 0,
          commercial_id: chat.commercial_id,
          name: chat.name
        }));
        setConversations(transformedConversations);
      }
    });

    socket.on("messages:get", (data: any) => {
      console.log("💬 Messages reçus:", data);

      if (data.messages) {
        setLastMessage({ ...data, type: 'messages_loaded' } as WebSocketMessage);
      }
    });

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

  const sendMessage = useCallback(
    (messageData: WebSocketMessage) => {
      if (socketRef.current && isConnected) {
        console.log("📤 Envoi du message via WebSocket:", messageData);
        socketRef.current.emit("agent:message", messageData);
        return true;
      }
      console.warn("⚠️ WebSocket non connecté, message non envoyé");
      return false;
    },
    [isConnected]
  );

  const joinConversation = useCallback(
    (conversationId: string) => {
      if (socketRef.current && isConnected && commercial) {
        console.log(`🚪 Rejoindre la conversation: ${conversationId}`);
        socketRef.current.emit("join:conversation", {
          conversationId,
          commercialId: commercial.id,
        });
        return true;
      }
      return false;
    },
    [isConnected, commercial]
  );

  const leaveConversation = useCallback(
    (conversationId: string) => {
      if (socketRef.current && isConnected) {
        console.log(`🚪 Quitter la conversation: ${conversationId}`);
        socketRef.current.emit("leave:conversation", { conversationId });
        return true;
      }
      return false;
    },
    [isConnected]
  );

  const loadConversation = useCallback(
    (commercialId: string) => {
      if (socketRef.current && isConnected) {
        console.log(`🚪 Charger la conversation pour le commercial: ${commercialId}`);
        socketRef.current.emit("get:conversation", { commercialId });
        return true;
      }
      return false;
    },
    [isConnected]
  );

  const loadMessages = useCallback(
    (conversationId: string) => {
      if (socketRef.current && isConnected) {
        console.log(`💬 Charger les messages pour la conversation: ${conversationId}`);
        socketRef.current.emit("get:messages", { conversationId });
        return true;
      }
      return false;
    },
    [isConnected]
  );

  const startTyping = useCallback(
    (conversationId: string) => {
      if (socketRef.current && isConnected && commercial) {
        socketRef.current.emit("typing:start", {
          conversationId,
          userId: commercial.id,
        });
        return true;
      }
      return false;
    },
    [isConnected, commercial]
  );

  const stopTyping = useCallback(
    (conversationId: string) => {
      if (socketRef.current && isConnected) {
        socketRef.current.emit("typing:stop", { conversationId });
        return true;
      }
      return false;
    },
    [isConnected]
  );

  const reconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.connect();
    }
  }, []);

  // Utiliser useMemo pour éviter de recréer l'objet à chaque render
  const webSocketApi = useMemo(
    () => ({
      isConnected,
      lastMessage,
      error,
      conversations,
      setConversations,
      sendMessage,
      joinConversation,
      leaveConversation,
      startTyping,
      stopTyping,
      reconnect,
      loadConversation,
      loadMessages
    }),
    [
      isConnected,
      lastMessage,
      error,
      conversations,
      sendMessage,
      joinConversation,
      leaveConversation,
      startTyping,
      stopTyping,
      reconnect,
      loadConversation,
      loadMessages
    ]
  );

  return webSocketApi;
};
