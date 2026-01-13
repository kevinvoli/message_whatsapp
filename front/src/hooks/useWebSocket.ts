"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import {
  Commercial,
  Conversation,
  WebSocketMessage,
  Message,
} from "@/types/chat";

interface WebSocketError {
  error: string;
}

export const useWebSocket = (commercial: Commercial | null) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]); // AJOUTÉ
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null); // AJOUTÉ
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (!commercial) return null;

    console.log("🔄 Tentative de connexion WebSocket...", commercial);

    const socket = io("http://localhost:3000", {
      transports: ["websocket", "polling"],
       auth: {
    commercialId: commercial.id,
    token: localStorage.getItem("token")
  },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      console.log("🟢 Connecté au socket");
      setIsConnected(true);
      setError(null);

      // Stocker la référence du socket
      socketRef.current = socket;

      // Charger les conversations de l'agent
      socket.emit("get:conversation", {
        agentId: commercial.id,
      });
    });

    socket.on("disconnect", (reason) => {
      console.log("🔴 Déconnecté:", reason);
      setIsConnected(false);
      if (reason === "io server disconnect") {
        setTimeout(() => socket.connect(), 1000);
      }
    });

    socket.on("connect_error", (err) => {
      console.error("❌ Erreur de connexion:", err.message);
      setError(`Erreur de connexion: ${err.message}`);
      setIsConnected(false);
    });

    socket.on("error", (data: WebSocketError) => {
      console.error("❌ Erreur WebSocket:", data.error);
      setError(data.error);
    });

    // Écoute des messages reçus
    socket.on("message:received", (data: WebSocketMessage) => {
      console.log("📩 Message reçu:", data);

      // Transformer le message reçu
      const transformedMessage: Message = {
        id: data.message?.id || `msg_${Date.now()}`,
        text: data.message?.text || "",
        timestamp: new Date(data.message?.timestamp || Date.now()),
        from: data.message?.from === "commercial" ? "commercial" : "client",
        status: data.message?.status || "sent",
        direction: data.message?.direction || "IN",
        sender_phone: data.message?.sender_phone,
        sender_name: data.message?.sender_name,
        from_me: data.message?.from_me || false,
      };

      // Mettre à jour les messages si c'est la conversation actuelle
      if (selectedConversationId === data.conversationId) {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === transformedMessage.id);
          if (!exists) {
            return [...prev, transformedMessage];
          }
          return prev;
        });
      }

      // Mettre à jour le dernier message dans la conversation
      setConversations((prev) =>
        prev.map((conv) =>
          conv.chat_id === data.conversationId
            ? {
                ...conv,
                lastMessage: {
                  text: transformedMessage.text,
                  timestamp: transformedMessage.timestamp,
                  author:
                    transformedMessage.from === "commercial"
                      ? "agent"
                      : "client",
                },
                unreadCount:
                  selectedConversationId === data.conversationId
                    ? conv.unreadCount
                    : conv.unreadCount + 1,
              }
            : conv
        )
      );
    });

    // Liste des conversations
    socket.on("conversation:list", (data: { conversations: Conversation[] }) => {
      console.log("📋 Liste des conversations reçue:", data);
      if (data.conversations) {
        setConversations(data.conversations);
      }
    });

    // Messages d'une conversation
    socket.on("messages:get", (data: { messages: Message[] }) => {
      console.log("💬 Messages chargés:", data);
      console.log("Nombre de messages reçus:", data.messages?.length || 0);

      if (data.messages && Array.isArray(data.messages)) {
        const transformedMessages: Message[] = data.messages.map((msg: Message) => {
          console.log("Message transformé:", msg);
          return {
            id: msg.id,
            text: msg.text || "",
            timestamp: new Date(msg.timestamp || Date.now()),
            from: msg.from_me ? "commercial" : "client", // Corrigez cette ligne
            status:
              msg.status === "sent"
                ? "sent"
                : msg.status === "delivered"
                ? "delivered"
                : msg.status === "read"
                ? "read"
                : "sent",
            direction: msg.direction || "IN",
            sender_phone: msg.from,
            sender_name: msg.sender_name,
            from_me: msg.from_me,
          };
        });

        console.log("Messages transformés:", transformedMessages);
        setMessages(transformedMessages);
      }
    });

    // Confirmation d'envoi
    socket.on("message:sent", (data: { message: Message }) => {
      console.log("✅ Message envoyé confirmé:", data);

      if (data.message) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id.includes("temp_") && msg.text === data.message.text
              ? {
                  id: data.message.id || msg.id,
                  text: data.message.text,
                  timestamp: new Date(data.message.timestamp || Date.now()),
                  from: "commercial",
                  status: "sent",
                  direction: "OUT",
                  sender_phone: data.message.sender_phone,
                  sender_name: data.message.sender_name,
                  from_me: true,
                }
              : msg
          )
        );
      }
    });

    // Conversation rejointe
    socket.on("conversation:joined", (data: { conversation?: Conversation }) => {
      console.log("🚪 Conversation rejointe:", data);
    });

    // Typing indicators
    socket.on(
      "typing:start",
      (data: { conversationId: string; userId: string }) => {
        console.log("✍️ L'utilisateur est en train d'écrire:", data);
      }
    );

    socket.on("typing:stop", (data: { conversationId: string }) => {
      console.log("⏹️ L'utilisateur a arrêté d'écrire:", data);
    });

    // Gestion des erreurs de conversation
    socket.on("conversation:error", (data: { error: string }) => {
      console.error("❌ Erreur conversation:", data.error);
      setError(data.error);
    });

    return socket;
  }, [commercial, selectedConversationId]);

  useEffect(() => {
    if (!commercial) return;

    const socket = connect();

    // Stocker la référence
    socketRef.current = socket;

    return () => {
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
    };
  }, [connect, commercial]);

  const sendMessage = useCallback(
    (messageData: { text: string; conversationId: string }) => {
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
        setSelectedConversationId(conversationId);
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
        if (selectedConversationId === conversationId) {
          setSelectedConversationId(null);
          setMessages([]);
        }
        return true;
      }
      return false;
    },
    [isConnected, selectedConversationId]
  );

  const loadConversation = useCallback(
    (commercialId: string) => {
      if (socketRef.current && isConnected) {
        console.log(`🚪 Charger les conversations pour: ${commercialId}`);
        socketRef.current.emit("get:conversation", { agentId: commercialId });
        return true;
      }
      return false;
    },
    [isConnected]
  );

  const loadMessages = useCallback(
    (conversationId: string) => {
      if (socketRef.current && isConnected) {
        console.log(`💬 Charger les messages pour: ${conversationId}`);
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

  const setSelectedConversation = useCallback(
    (conversationId: string | null) => {
      setSelectedConversationId(conversationId);
    },
    []
  );

  const webSocketApi = useMemo(
    () => ({
      isConnected,
      lastMessage,
      error,
      conversations,
      messages,
      setConversations,
      setMessages,
      setSelectedConversation,
      selectedConversationId,
      sendMessage,
      joinConversation,
      leaveConversation,
      startTyping,
      stopTyping,
      reconnect,
      loadConversation,
      loadMessages,
    }),
    [
      isConnected,
      lastMessage,
      error,
      conversations,
      messages,
      setSelectedConversation,
      selectedConversationId,
      sendMessage,
      joinConversation,
      leaveConversation,
      startTyping,
      stopTyping,
      reconnect,
      loadConversation,
      loadMessages,
    ]
  );

  return webSocketApi;
};
