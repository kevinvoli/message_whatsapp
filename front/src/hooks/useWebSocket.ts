// src/hooks/useWebSocket.ts
"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { LogOut } from "lucide-react";
import { Commercial, Conversation, Message } from "@/types/chat";

export const useWebSocket = (commercial: Commercial | null) => {
   const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref pour la conversation sélectionnée
  const selectedConversationRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);

 useEffect(() => {
    selectedConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Créer et configurer la connexion socket
  const createSocket = useCallback(() => {
    if (!commercial) {
      console.log("⚠️ Commercial non disponible pour WebSocket");
      return null;
    }

    // Récupérer le token
    const token = localStorage.getItem("token");
    if (!token) {
      console.error("❌ Token manquant");
      setError("Token d'authentification manquant");
      return null;
    }

    // Créer la connexion socket
    const socket = io("http://localhost:3001", {
      transports: ["websocket", "polling"],
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

        // Authentification automatique
        const token = localStorage.getItem("token");
        console.log("nouvel request :punch:", token, commercial);

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

      console.log("🔌 Création socket pour:", selectedConversationId);
      socket.onAny((event, ...args) => {
        console.log("👀 SOCKET EVENT:", event, args);
      });

      socket.on(
        "conversation:list",
        (data: { conversations: Conversation[] }) => {
          console.log("📋 Conversations reçues:", data.conversations?.length);
          if (data.conversations) {
            setConversations(data.conversations);
          }
        }
      );

      socket.on(
        "messages:get",(data: { conversationId: string; messages: any[] }) => {
          console.log("💬 Messages reçus:", data.messages?.length);
          console.log("💬 Messages reçus:", data.messages);

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
                from_me: msg.from_me || false, // Toujours fournir une valeur
              })
            );
            setMessages(transformedMessages);
          }
        }
      );

      socket.on(
        "message:received",
        (data: { conversationId: string; message: any }) => {
          console.log(
            "📩 Message reçu en temps réel (message:received):",
            data
          );
          if (data.message.from_me) {
            return;
          }
          // Vérifier que c'est la conversation sélectionnée
          if (
            selectedConversationId &&
            data.conversationId !== selectedConversationId
          ) {
            return;
          }
          const newMessage: Message = {
            id: data.message.id,
            text: data.message.text,
            timestamp: new Date(data.message.timestamp || Date.now()),
            from: data.message.from_me ? "commercial" : "client",
            status: data.message.status || "sent",
            direction: data.message.direction || "IN",
            sender_phone: data.message.from,
            sender_name: data.message.from_name,
            from_me: data.message.from_me,
          };

          setMessages((prev) => [...prev, newMessage]);
        }
      );

      socket.on("reception",(data: { conversationId: string; messages: any }) => {
         
           console.log(
            "affichage des message yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
            data
          );
        if (!data.messages) return;
   console.log(
            "affichage des message yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
            data
          );
          // Vérifie avec la ref au lieu du state
          if (
            selectedConversationRef.current &&
            data.conversationId !== selectedConversationRef.current
          )
            return;
          console.log(
            "affichage des message yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
            data
          );

          const newMessage: Message = {
            id: data.messages.id,
            text: data.messages.text,
            timestamp: new Date(data.messages.timestamp || Date.now()),
            from: data.messages.from_me ? "commercial" : "client",
            status: data.messages.status || "sent",
            direction: data.messages.direction || "IN",
            sender_phone: data.messages.from,
            sender_name: data.messages.from_name,
            from_me: data.messages.from_me,
          };

          console.log(
            "affichage des message yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
            newMessage
          );

          setMessages((prev) => [...prev, newMessage]);
        }
      );

      // socket.to(selectedConversationId).on()

      socket.on(
        `${selectedConversationId}`,
        (data: { conversationId: string; message: any }) => {
          console.log("📩 Message reçu en temps réel");
          if (data.message && selectedConversationId === data.conversationId) {
            const newMessage: Message = {
              id: data.message.id,
              text: data.message.text,
              timestamp: new Date(data.message.timestamp || Date.now()),
              from: data.message.from_me ? "commercial" : "client",
              status: data.message.status || "sent",
              direction: data.message.direction || "IN",
              sender_phone: data.message.from,
              sender_name: data.message.from_name,
              from_me: data.message.from_me,
            };
            setMessages((prev) => [...prev, newMessage]);
          }
        }
      );

      socket.on(
        "message:sent",
        (data: { conversationId: string; message: any }) => {
          console.log("✅ Message envoyé confirmé:", data);
        }
      );
    },
    [selectedConversationId, commercial]
  );


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

    // Nettoyage
    return () => {
      console.log("🧹 Nettoyage WebSocket");
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
    };
  }, [commercial, createSocket, setupSocketListeners]);

  // Fonctions pour interagir avec le socket

  // Ajout des fonctions manquantes
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
    [isConnected, selectedConversationId]
  );

  const setSelectedConversation = useCallback(
    (conversationId: string | null) => {
      setSelectedConversationId(conversationId);
    },
    []
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
    [isConnected]
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
    [isConnected]
  );

  const LogOut = useCallback(() => {
    if (socketRef.current && isConnected) {
      console.log("📤 deconnection:");
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
    [isConnected, commercial]
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
    [isConnected]
  );

  const reconnect = useCallback(() => {
    console.log("🔄 Reconnexion...");
    if (socketRef.current) {
      socketRef.current.connect();
    }
  }, []);

  // API exposée - Ajouter toutes les propriétés nécessaires
  const webSocketApi = useMemo(
    () => ({
      // État
      isConnected,
      error,
      conversations,
      messages,
      selectedConversationId,

      // Setters
      setConversations,
      setMessages,
      setSelectedConversation,
      LogOut,
      // Actions
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
      LogOut,
      setConversations,
      setMessages,
      setSelectedConversation,
      sendMessage,
      joinConversation,
      leaveConversation,
      loadConversation,
      loadConversations,
      loadMessages,
      reconnect,
    ]
  );

  return webSocketApi;
};
