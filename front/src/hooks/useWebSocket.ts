"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { Commercial, Conversation, Message } from "@/types/chat";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000";

interface UseWebSocketOptions {
  commercial: Commercial | null;
  onConversationList: (conversations: Conversation[]) => void;
  onNewMessage: (message: Message) => void;
  onMessageStatusUpdate: (update: { messageId: string, status: string }) => void;
  onNewConversation: (conversation: Conversation) => void;
  onConversationAssigned: (assignment: { conversationId: string, commercialId: string }) => void;
  onTypingStart: (typing: { conversationId: string, commercialId: string }) => void;
  onTypingStop: (typing: { conversationId: string, commercialId: string }) => void;
}

export const useWebSocket = ({
  commercial,
  onConversationList,
  onNewMessage,
  onMessageStatusUpdate,
  onNewConversation,
  onConversationAssigned,
  onTypingStart,
  onTypingStop,
}: UseWebSocketOptions) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (!commercial || !localStorage.getItem("token")) {
      return;
    }

    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      auth: { token: localStorage.getItem("token") },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setError(null);
      socket.emit("user:connected", { commercialId: commercial.id });
    });

    socket.on("disconnect", () => setIsConnected(false));
    socket.on("connect_error", (err) => setError(err.message));

    socket.on("conversation:list", onConversationList);
    socket.on("message:receive", onNewMessage);
    socket.on("message:status:update", onMessageStatusUpdate);
    socket.on("conversation:new", onNewConversation);
    socket.on("conversation:assigned", onConversationAssigned);
    socket.on("typing:start:broadcast", onTypingStart);
    socket.on("typing:stop:broadcast", onTypingStop);
    socket.on("error", (err: { message: string }) => setError(err.message));

  }, [commercial, onConversationList, onNewMessage, onMessageStatusUpdate, onNewConversation, onConversationAssigned, onTypingStart, onTypingStop]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
  }, []);

  useEffect(() => {
    if (commercial) {
      connect();
    }
    return () => disconnect();
  }, [commercial, connect, disconnect]);

  const createAndEmit = <T,>(eventName: string) =>
    useCallback((payload: T) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit(eventName, payload);
        return true;
      }
      return false;
    }, []);

  return useMemo(() => ({
    isConnected,
    error,
    reconnect: connect,
    sendMessage: createAndEmit<{ conversationId: string; content: string; type: 'TEXT' | 'IMAGE' | 'DOCUMENT'; mediaUrl?: string }>('message:send'),
    requestConversations: createAndEmit<{ commercialId: string }>('conversations:get'),
    requestMessages: createAndEmit<{ conversationId: string }>('messages:get'),
    startTyping: createAndEmit<{ conversationId:string; commercialId: string }>('typing:start'),
    stopTyping: createAndEmit<{ conversationId: string; commercialId: string }>('typing:stop'),
    markAsRead: createAndEmit<{ conversationId: string; messageIds: string[] }>('messages:read'),
  }), [isConnected, error, connect, createAndEmit]);
};
