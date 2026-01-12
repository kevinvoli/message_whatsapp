export interface Commercial {
  id: string;
  name: string;
  email: string;
}

export interface Message {
  id: string;
  text: string;
  timestamp: Date;
  from: 'commercial' | 'client';
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error'; // Ajoutez 'error'
}

export interface Conversation {
  id: string;
  clientName: string;
  clientPhone: string;
  lastMessage: Message;
  unreadCount: number;
  status: 'active' | 'inactive' | 'archived';
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error';

export interface WebSocketMessage {
  type: 'auth' | 'new_conversation' | 'new_message' | 'message_status' | 'conversation_reassigned' | 'send_message';
  commercialId?: string;
  token?: string;
  conversationId?: string;
  conversation?: Conversation;
  message?: Message;
  messageId?: string;
  status?: string;
  clientPhone?: string;
  text?: string;
  timestamp?: Date;
}

export interface LoginFormData {
  email: string;
  name: string;
}
