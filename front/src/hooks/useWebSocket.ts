// src/hooks/useWebSocket.ts
"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { Commercial, Conversation, Message } from "@/types/chat";

export const useWebSocket = (commercial: Commercial | null) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Créer et configurer la connexion socket
  const createSocket = useCallback(() => {
    if (!commercial) {
      console.log("⚠️ Commercial non disponible pour WebSocket");
      return null;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      console.error("❌ Token manquant");
      setError("Token d'authentification manquant");
      return null;
    }

    const socket = io("http://localhost:3001", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 15000,
      auth: {
        commercialId: commercial.id,
        token: token,
      },
    });

    return socket;
  }, [commercial]);

  // Configurer les écouteurs d'événements
  const setupSocketListeners = useCallback(
    (socket: Socket) => {
      socket.on("connect", () => {
        console.log("🟢 Socket connecté:", socket.id);
        setIsConnected(true);
        setError(null);

        const token = localStorage.getItem("token");

        if (token && commercial) {
          socket.emit("auth", {
            commercialId: commercial.id,
            token: token,
          });
        }
      });

      socket.on("disconnect", (reason) => {
        console.log("🔴 Socket déconnecté:", reason);
        setIsConnected(false);
      });

      socket.on("connect_error", (err) => {
        console.error("❌ Erreur connexion socket:", err.message);
        setError(`Erreur: ${err.message}`);
        setIsConnected(false);
      });

      socket.on("auth:success", (data) => {
        console.log("✅ Authentification réussie:", data);
      });

      socket.on("error", (data: { error: string }) => {
        console.error("❌ Erreur WebSocket:", data.error);
        setError(data.error);
      });

      socket.on(
        "conversation:list",
        (data: { conversations: Conversation[] }) => {
          console.log("📋 Conversations reçues:", data.conversations?.length);
          if (data.conversations) {
            setConversations(data.conversations);
          }
        },
      );

      socket.on(
        "messages:get",
        (data: { conversationId: string; messages: any[] }) => {
          console.log("💬 Messages reçus:", data.messages?.length);

          if (data.messages) {
            const transformedMessages: Message[] = data.messages.map(
              (msg: any) => ({
                id: msg.id,
                text: msg.text || "",
                timestamp: new Date(msg.timestamp || Date.now()),
                from: msg.from_me ? "commercial" : "client",
                status: msg.status || "sent",
                direction: msg.direction || "IN",
                sender_phone: msg.from,
                sender_name: msg.from_name,
                from_me: msg.from_me || false,
              }),
            );
            setMessages(transformedMessages);
          }
        },
      );

      socket.on(
        "message:sent",
        (data: { conversationId: string; message: any }) => {
          console.log("✅ Message envoyé confirmé:", data);
        },
      );

  socket.on("conversation:updated", (conversation: Conversation) => {
  console.log("✅ Conversation update reçu:", conversation);

  if (conversation) {
    setConversations((prev) => {
      // Vérifier si la conversation existe déjà
      const index = prev.findIndex((conv) => conv.chat_id === conversation.chat_id);
      let newConversations;
      if (index !== -1) {
        // Si elle existe, on la met à jour
        console.log("🔄 Mise à jour de la conversation:", conversation);
        newConversations = [...prev];
        newConversations[index] = conversation;
      } else {
        // Sinon, on l'ajoute
        console.log("✅ Ajout d'une nouvelle conversation:", conversation.chat_id);
        newConversations = [...prev, conversation];
      }
      // Trier par date du dernier message (plus récent en premier)
      newConversations.sort((a, b) =>
        new Date(b.lastMessage.timestamp).getTime() - new Date(a.lastMessage.timestamp).getTime()
      );
      return newConversations;
    });
  }
});

      // ✅ Debug : Écouter TOUS les événements

      socket.onAny((event, ...args) => {
        console.log(`🔔 Event reçu: ${event}`, args);
      });
    },
    [commercial],
  );

  // ✅ EFFET SÉPARÉ pour écouter les messages en temps réel de la conversation active
  useEffect(() => {
    if (
      !selectedConversationId ||
      !socketRef.current ||
      !socketRef.current.connected
    ) {
      return;
    }

    const eventName = `message:received`;

    const handleIncomingMessage = (data:{
        conversationId: string, // ✅ PAS chat.id
        message: any,
      }) => {
        const msg=data.message;
      console.log("═══════════════════════════════════════════════════════");
      console.log(`📩 MESSAGE EN TEMPS RÉEL`);
      console.log("Event:", eventName);
      console.log("Message:", msg);
      console.log("═══════════════════════════════════════════════════════");

      const newMessage: Message = {
        id: msg.id,
        text: msg.text,
        timestamp: new Date(msg.timestamp || Date.now()),
        from: msg.from,
        status: msg.status || "sent",
        direction: msg.direction || "IN",
        sender_phone: msg.from,
        sender_name: msg.from_name,
        from_me: msg.from_me,
      };




      setMessages((prev) => {
        // ✅ Éviter les doublons
        const exists = prev.some((m) => m.id === newMessage.id);
        if (exists) {
          console.log("⚠️ Message déjà présent:", newMessage.id);
          return prev;
        }
        console.log("✅ Ajout nouveau message:", newMessage.id);
        return [...prev, newMessage];
      });
    };

    console.log("👂 Écoute des messages sur:", eventName);
    socketRef.current.on(eventName, handleIncomingMessage);

    return () => {
      console.log("🧹 Arrêt écoute de", eventName);
      socketRef.current?.off(eventName, handleIncomingMessage);
    };
  }, [selectedConversationId]);

  useEffect(() => {
    if (!commercial) {
      console.log("❌ Pas de commercial, arrêt WebSocket");
      return;
    }

    console.log("🚀 Initialisation WebSocket...");

    const socket = createSocket();
    if (!socket) {
      console.error("❌ Impossible de créer le socket");
      return;
    }

    setupSocketListeners(socket);
    socketRef.current = socket;

    return () => {
      console.log("🧹 Nettoyage WebSocket");
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
    };
  }, [commercial, createSocket, setupSocketListeners]);

  const leaveConversation = useCallback(
    (conversationId: string) => {
      if (socketRef.current && isConnected) {
        console.log(`🚪 Quitter conversation: ${conversationId}`);
        socketRef.current.emit("leave:conversation", { conversationId });
        if (selectedConversationId === conversationId) {
          setSelectedConversationId(null);
          setMessages([]);
        }
        return true;
      }
      return false;
    },
    [isConnected, selectedConversationId],
  );

  const setSelectedConversation = useCallback(
    (conversationId: string | null) => {
      setSelectedConversationId(conversationId);
    },
    [],
  );

  const loadConversation = useCallback(
    (commercialId: string) => {
      if (socketRef.current && isConnected) {
        console.log(`📋 Charger conversations pour: ${commercialId}`);
        socketRef.current.emit("get:conversation", { agentId: commercialId });
        return true;
      }
      return false;
    },
    [isConnected],
  );

  const sendMessage = useCallback(
    (messageData: {
      text: string;
      conversationId: string;
      chat_id: string;
      author: string;
    }) => {
      if (socketRef.current && isConnected) {
        console.log("📤 Envoi message:", messageData);
        socketRef.current.emit("agent:message", {
          conversationId: messageData.conversationId,
          content: messageData.text,
          chat_id: messageData.chat_id,
          author: messageData.author,
        });
        return true;
      }
      console.warn("⚠️ Socket non connecté");
      return false;
    },
    [isConnected],
  );

  const LogOut = useCallback(() => {
    if (socketRef.current && isConnected) {
      console.log("📤 Déconnexion");
      socketRef.current.emit("agent:logout");
      return true;
    }
    console.warn("⚠️ Socket non connecté");
    return false;
  }, [isConnected]);

  const joinConversation = useCallback(
    (conversationId: string) => {
      if (socketRef.current && isConnected && commercial) {
        console.log(`🚪 Rejoindre conversation: ${conversationId}`);
        setSelectedConversationId(conversationId);
        socketRef.current.emit("join:conversation", {
          conversationId,
          commercialId: commercial.id,
        });
        return true;
      }
      return false;
    },
    [isConnected, commercial],
  );

  const loadConversations = useCallback(() => {
    if (socketRef.current && isConnected && commercial) {
      console.log("📋 Chargement conversations");
      socketRef.current.emit("get:conversation", {
        agentId: commercial.id,
      });
      return true;
    }
    return false;
  }, [isConnected, commercial]);

  const loadMessages = useCallback(
    (conversationId: string) => {
      if (socketRef.current && isConnected) {
        console.log(`💬 Chargement messages: ${conversationId}`);
        socketRef.current.emit("get:messages", { conversationId });
        return true;
      }
      return false;
    },
    [isConnected],
  );

  const reconnect = useCallback(() => {
    console.log("🔄 Reconnexion...");
    if (socketRef.current) {
      socketRef.current.connect();
    }
  }, []);

  const webSocketApi = useMemo(
    () => ({
      isConnected,
      error,
      conversations,
      messages,
      selectedConversationId,
      setConversations,
      setMessages,
      setSelectedConversation,
      LogOut,
      sendMessage,
      joinConversation,
      leaveConversation,
      loadConversation,
      loadConversations,
      loadMessages,
      reconnect,
    }),
    [
      isConnected,
      error,
      conversations,
      messages,
      selectedConversationId,
      setSelectedConversation,
      LogOut,
      sendMessage,
      joinConversation,
      leaveConversation,
      loadConversation,
      loadConversations,
      loadMessages,
      reconnect,
    ],
  );

  return webSocketApi;
};
