export interface Commercial {
  id: string;
  name: string;
  email: string;
}

export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ' | 'sending' | 'error';

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  type: 'TEXT' | 'IMAGE' | 'DOCUMENT';
  sender: 'COMMERCIAL' | 'CLIENT';
  status: MessageStatus;
  sentAt: Date;
  // Make sure all expected properties are here
  text?: string;
  timestamp?: Date;
  from?: 'commercial' | 'client';
  direction?: 'IN' | 'OUT';
  sender_phone?: string;
  from_me?: boolean;
  sender_name?: string;
}

export interface Conversation {
  id: string;
  clientName: string;
  clientPhone: string;
  lastMessage?: Message;
  unreadCount: number;
  status: 'ALL' | 'ACTIVE' | 'PENDING' | 'CLOSED';
  // existing properties
  chat_id: string;
  messages: Message[];
  commercial_id?: string;
  name: string;
  clientProfilePic?: string; // Added from another step
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
  password?: string;
  name?: string;
}

