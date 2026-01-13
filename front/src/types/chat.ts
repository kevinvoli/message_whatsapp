export interface Commercial {
  id: string;
  name: string;
  email: string;
}

export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ' | 'SENDING' | 'ERROR';

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  type: 'TEXT' | 'IMAGE' | 'DOCUMENT';
  sender: 'COMMERCIAL' | 'CLIENT';
  status: MessageStatus;
  sentAt: Date;
}

export interface Conversation {
  id: string;
  clientName: string;
  clientPhone: string;
  lastMessage?: Message;
  unreadCount: number;
  status: 'ACTIVE' | 'PENDING' | 'CLOSED';
  messages: Message[];
  commercialId?: string;
  clientProfilePic?: string;
}

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

