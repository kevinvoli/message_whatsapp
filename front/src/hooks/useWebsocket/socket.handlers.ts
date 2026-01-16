// src/socket/socket.handlers.ts
import { Conversation, Message } from "@/types/chat";

export const createSocketHandlers = ({
  setIsConnected,
  setError,
  setConversations,
  setMessages,
  selectedConversationId,
}: any) => ({
  onConnect(socketId: string) {
    console.log("🟢 Connecté:", socketId);
    setIsConnected(true);
    setError(null);
  },

  onDisconnect(reason: string) {
    console.log("🔴 Déconnecté:", reason);
    setIsConnected(false);
  },

  onConversationList(conversations: Conversation[]) {
    setConversations(conversations);
  },

  onMessages(conversationId: string, messages: any[]) {
    const transformed: Message[] = messages.map((msg) => ({
      id: msg.id,
      text: msg.text ?? "",
      timestamp: new Date(msg.timestamp),
      from: msg.from_me ? "commercial" : "client",
      status: msg.status ?? "sent",
      direction: msg.direction ?? "IN",
      sender_phone: msg.from,
      sender_name: msg.from_name,
      from_me: msg.from_me,
    }));

    setMessages(transformed);
  },

  onMessageReceived(conversationId: string, message: any) {
    if (conversationId !== selectedConversationId) return;

    setMessages((prev: Message[]) => [
      ...prev,
      {
        id: message.id,
        text: message.text,
        timestamp: new Date(message.timestamp),
        from: message.from_me ? "commercial" : "client",
        status: message.status,
        direction: message.direction,
        sender_phone: message.from,
        sender_name: message.from_name,
        from_me: message.from_me,
      },
    ]);
  },
});
