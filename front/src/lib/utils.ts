// utils/messageUtils.ts
import { Message } from '@/types/chat';

export const createMessage = (data: any): Message => ({
  id: data.id || `msg_${Date.now()}`,
  text: data.text || "",
  timestamp: new Date(data.timestamp || Date.now()),
  from: data.from_me ? "commercial" : "client",
  status: data.status || "sent",
  direction: data.direction || "IN",
  sender_phone: data.from,
  sender_name: data.from_name || (data.from_me ? "Agent" : "Client"),
  from_me: !!data.from_me, // Convertir en boolean
});

// Puis dans useWebSocket.ts
import { createMessage } from '@/utils/messageUtils';

// Utilisation
const transformedMessages: Message[] = data.messages.map(createMessage);