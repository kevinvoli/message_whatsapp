// src/types/events.ts
import { Message } from './chat';

export interface ConversationUpdatedPayload {
  chat_id: string;
  lastMessage: {
    text: string;
    timestamp: Date;
    author: 'agent' | 'client';
  };
  unread_count: number;
}

export interface MessagePayload {
  conversationId: string;
  message: Message;
}

export interface NotificationPayload {
  title: string;
  body: string;
  conversationId: string;
}
