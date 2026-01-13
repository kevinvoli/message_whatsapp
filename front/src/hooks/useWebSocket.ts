"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { Commercial, Conversation, Message } from "@/types/chat";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

interface UseWebSocketOptions {
  commercial: Commercial | null;
  onConversationList: (conversations: Conversation[]) => void;
  onMessageList: (messages: Message[]) => void;
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
  onMessageList,
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
    socket.on("message:list", onMessageList);
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

  const sendMessage = useCallback((payload: { conversationId: string; content: string; type: 'TEXT' | 'IMAGE' | 'DOCUMENT'; mediaUrl?: string }) => {
    socketRef.current?.emit('message:send', payload);
  }, []);

  const requestConversations = useCallback((payload: { commercialId: string }) => {
    socketRef.current?.emit('conversations:get', payload);
  }, []);

  const requestMessages = useCallback((payload: { conversationId: string }) => {
    socketRef.current?.emit('messages:get', payload);
  }, []);

  const startTyping = useCallback((payload: { conversationId:string; commercialId: string }) => {
    socketRef.current?.emit('typing:start', payload);
  }, []);

  const stopTyping = useCallback((payload: { conversationId: string; commercialId: string }) => {
    socketRef.current?.emit('typing:stop', payload);
  }, []);

  const markAsRead = useCallback((payload: { conversationId: string; messageIds: string[] }) => {
    socketRef.current?.emit('messages:read', payload);
  }, []);

  return useMemo(() => ({
    isConnected,
    error,
    reconnect: connect,
    sendMessage,
    requestConversations,
    requestMessages,
    startTyping,
    stopTyping,
    markAsRead,
  }), [isConnected, error, connect, sendMessage, requestConversations, requestMessages, startTyping, stopTyping, markAsRead]);
};
