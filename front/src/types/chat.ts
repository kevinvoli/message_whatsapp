// types/chat.ts

/**
 * @fileoverview Ce fichier définit les types et interfaces principaux utilisés
 * dans l'application de chat, ainsi que des fonctions utilitaires pour
 * créer, transformer et valider ces objets.
 */

// ==============================================
// INTERFACES PRINCIPALES
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
  sender_phone?: string;
  from_me: boolean;
  sender_name?: string;
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
  name: string;
  status: 'actif' | 'en attente' | 'fermé';
  createdAt: Date;
  updatedAt: Date;
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
  password: string;
}

// ==============================================
// INTERFACES POUR LES DONNÉES BRUTES (API)
// ==============================================

interface RawMessageData {
    id: string;
    text?: string | null;
    timestamp: string | number | Date;
    from_me: boolean;
    status: string;
    direction: 'IN' | 'OUT';
    from: string;
    from_name?: string;
    content?: string;
    createdAt?: string | number | Date;
}

interface RawConversationData {
    id: string;
    chat_id: string;
    clientName?: string; // Gardé pour la compatibilité
    client_name?: string;
    name?: string;
    clientPhone?: string;
    client_phone?: string;
    messages?: RawMessageData[];
    last_message?: RawMessageData | null;
    unreadCount?: number; // Gardé pour la compatibilité
    unread_count?: number;
    commercial_id?: string | null;
    status: 'actif' | 'en attente' | 'fermé';
    created_at: string | number | Date;
    updated_at: string | number | Date;
}

interface RawCommercialData {
    id: string;
    name?: string;
    username?: string;
    email: string;
}

// ==============================================
// FONCTIONS DE TRANSFORMATION
// ==============================================

/**
 * Transforme des données brutes en un objet Message valide.
 */
export const transformToMessage = (rawData: RawMessageData): Message => {
  return {
    id: rawData.id,
    text: rawData.text || rawData.content || '',
    timestamp: new Date(rawData.timestamp || rawData.createdAt || Date.now()),
    from: rawData.from_me ? 'commercial' : 'client',
    status: (rawData.status as MessageStatus) || 'sent',
    direction: rawData.direction || (rawData.from_me ? 'OUT' : 'IN'),
    sender_phone: rawData.from || '',
    sender_name: rawData.from_name || (rawData.from_me ? 'Agent' : 'Client'),
    from_me: !!rawData.from_me,
  };
};

/**
 * Transforme des données brutes en un objet Conversation valide.
 */
export const transformToConversation = (rawData: RawConversationData): Conversation => {
  
  
  const messages: Message[] = Array.isArray(rawData.messages)
    ? rawData.messages.map(transformToMessage)
    : [];

  return {
    id: rawData.id,
    chatId: rawData.chat_id,
    clientName: rawData.client_name || rawData.clientName || rawData.name || 'Client Inconnu',
    clientPhone: rawData.client_phone || rawData.clientPhone || rawData.chat_id?.split('@')[0] || '',
    lastMessage: rawData.last_message ? transformToMessage(rawData.last_message) : null,
    messages,
    unreadCount: rawData.unread_count ?? rawData.unreadCount ?? 0,
    commercialId: rawData.commercial_id,
    name: rawData.name || rawData.clientName || 'Conversation',
    status: rawData.status || 'en attente',
    createdAt: new Date(rawData.created_at),
    updatedAt: new Date(rawData.updated_at),
  };
};

/**
 * Transforme des données brutes en un objet Commercial valide.
 */
export const transformToCommercial = (rawData: RawCommercialData): Commercial => {
  return {
    id: rawData.id,
    name: rawData.name || rawData.username || '',
    email: rawData.email,
  };
};

// ==============================================
// FONCTIONS DE VALIDATION (TYPE GUARDS)
// ==============================================

/**
 * Valide si un objet est un Message valide.
 */
export const isValidMessage = (data: unknown): data is Message => {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Message;
  return (
    typeof msg.id === 'string' &&
    typeof msg.text === 'string' &&
    msg.timestamp instanceof Date &&
    typeof msg.from === 'string' &&
    typeof msg.from_me === 'boolean'
  );
};

/**
 * Valide si un objet est une Conversation valide.
 */
export const isValidConversation = (data: unknown): data is Conversation => {
  console.log("validation convetsation:ttttttttttttttttttttttttttttttttttt",data);
  
    if (typeof data !== 'object' || data === null) return false;
    const conv = data as Conversation;
    return (
      typeof conv.id === 'string' &&
      typeof conv.chat_id === 'string' &&
      typeof conv.client_name === 'string' &&
      Array.isArray(conv.messages)
    );
};

/**
 * Valide si un objet est un Commercial valide.
 */
export const isValidCommercial = (data: unknown): data is Commercial => {
    if (typeof data !== 'object' || data === null) return false;
    const com = data as Commercial;
    return (
      typeof com.id === 'string' &&
      typeof com.name === 'string' &&
      typeof com.email === 'string'
    );
};

// ==============================================
// CONSTANTES ET TYPES UTILITAIRES
// ==============================================

export const MESSAGE_STATUSES: MessageStatus[] = ['sending', 'sent', 'delivered', 'read', 'error'];
export const WEBSOCKET_MESSAGE_TYPES = ['auth', 'new_conversation', 'new_message', 'message_status', 'conversation_reassigned', 'send_message'] as const;

/**
 * Type guard pour MessageStatus.
 */
export const isMessageStatus = (status: unknown): status is MessageStatus => {
  return typeof status === 'string' && MESSAGE_STATUSES.includes(status as MessageStatus);
};

/**
 * Type guard pour WebSocketMessage type.
 */
export const isWebSocketMessageType = (type: unknown): type is WebSocketMessage['type'] => {
  return typeof type === 'string' && WEBSOCKET_MESSAGE_TYPES.includes(type as WebSocketMessage['type']);
};
