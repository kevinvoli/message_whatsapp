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
  const messages: Message[] = Array.isArray(rawData.messages)
    ? rawData.messages.map(transformToMessage)
    : [];

  return {
    id: rawData.id,
    chatId: rawData.chat_id,
    clientName: rawData.client_name || rawData.clientName || 'Client Inconnu',
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
