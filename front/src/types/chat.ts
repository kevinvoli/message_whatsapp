// types/chat.ts

// ==============================================
// INTERFACES FRONTEND (camelCase)
// ==============================================

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
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  direction?: 'IN' | 'OUT';
  from_me: boolean;
}

export interface Conversation {
  id: string;
  chatId: string;
  clientName: string;
  clientPhone: string;
  lastMessage: Message | null;
  messages: Message[];
  unreadCount: number;
  commercialId?: string | null;
  status: 'actif' | 'en attente' | 'fermé';
  updatedAt: Date;
}

// ==============================================
// INTERFACES POUR DONNÉES BRUTES (snake_case)
// ==============================================

interface RawMessageData {
  id: string;
  text?: string | null;
  timestamp: string | number | Date;
  from_me: boolean;
  status: string;
  direction: 'IN' | 'OUT';
}

interface RawConversationData {
  id: string;
  chat_id: string;
  name?: string; // Le nom du client peut être ici
  client_name?: string; // Ou ici
  client_phone?: string;
  last_message?: RawMessageData; // Notez le snake_case
  lastMessage?: RawMessageData; // Ou parfois camelCase
  messages?: RawMessageData[];
  unread_count?: number;
  unreadCount?: number;
  commercial_id?: string | null;
  status: 'actif' | 'en attente' | 'fermé';
  updatedAt: string | number | Date;
}

// ==============================================
// FONCTIONS DE TRANSFORMATION ROBUSTES
// ==============================================

export const transformToMessage = (rawData: RawMessageData): Message => ({
  id: rawData.id,
  text: rawData.text || '',
  timestamp: new Date(rawData.timestamp),
  from: rawData.from_me ? 'commercial' : 'client',
  status: rawData.status as Message['status'],
  direction: rawData.direction,
  from_me: rawData.from_me,
});

export const transformToConversation = (rawData: RawConversationData): Conversation => {
  // Gère les deux cas pour le dernier message
  const rawLastMessage = rawData.last_message || rawData.lastMessage;

  return {
    id: rawData.id,
    chatId: rawData.chat_id,
    // Cherche le nom dans plusieurs propriétés possibles
    clientName: rawData.name || rawData.client_name || 'Client Inconnu',
    clientPhone: rawData.client_phone || rawData.chat_id?.split('@')[0] || '',
    lastMessage: rawLastMessage ? transformToMessage(rawLastMessage) : null,
    messages: Array.isArray(rawData.messages) ? rawData.messages.map(transformToMessage) : [],
    // Gère les deux cas pour le compteur
    unreadCount: rawData.unread_count ?? rawData.unreadCount ?? 0,
    commercialId: rawData.commercial_id,
    status: rawData.status,
    updatedAt: new Date(rawData.updatedAt),
  };
};
