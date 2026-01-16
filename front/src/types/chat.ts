// types/chat.ts
export interface Commercial {
  id: string;
  name: string;
  email: string;
}

export interface Message {
  id: string;
  text: string;
  timestamp: Date;
  from: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  direction?: 'IN' | 'OUT';
  sender_phone?: string;
  from_me: boolean; // Je le garde obligatoire pour la cohérence
  sender_name?: string;
}

export interface Conversation {
  id: string;
  chat_id: string;
  clientName: string;
  clientPhone: string;
  lastMessage: {
    text: string;
    timestamp: Date;
    author: 'agent' | 'client';
  };
  messages: Message[];
  unreadCount: number;
  commercial_id?: string;
  name: string;
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
// FONCTIONS UTILITAIRES DE CRÉATION
// ==============================================

/**
 * Crée un objet Commercial valide avec des valeurs par défaut
 */
export const createCommercial = (data: Partial<Commercial>): Commercial => ({
  id: data.id || '',
  name: data.name || '',
  email: data.email || '',
});

/**
 * Crée un objet Message valide avec des valeurs par défaut
 */
export const createMessage = (data: Partial<Message>): Message => ({
  id: data.id || `msg_${Date.now()}`,
  text: data.text || '',
  timestamp: data.timestamp || new Date(),
  from: data.from || 'client',
  status: data.status || 'sent',
  direction: data.direction || 'IN',
  sender_phone: data.sender_phone,
  sender_name: data.sender_name,
  from_me: data.from_me !== undefined ? data.from_me : false,
});

/**
 * Crée un objet Conversation valide avec des valeurs par défaut
 */
export const createConversation = (data: Partial<Conversation>): Conversation => ({
  id: data.id || `conv_${Date.now()}`,
  chat_id: data.chat_id || '',
  clientName: data.clientName || '',
  clientPhone: data.clientPhone || '',
  lastMessage: data.lastMessage || {
    text: '',
    timestamp: new Date(),
    author: 'client'
  },
  messages: data.messages || [],
  unreadCount: data.unreadCount || 0,
  commercial_id: data.commercial_id,
  name: data.name || '',
});

/**
 * Crée un objet WebSocketMessage valide avec des valeurs par défaut
 */
export const createWebSocketMessage = (data: Partial<WebSocketMessage>): WebSocketMessage => ({
  type: data.type || 'new_message',
  commercialId: data.commercialId,
  token: data.token,
  conversationId: data.conversationId,
  conversation: data.conversation,
  message: data.message,
  messageId: data.messageId,
  status: data.status,
  clientPhone: data.clientPhone,
  text: data.text,
  timestamp: data.timestamp,
});

/**
 * Crée un objet LoginFormData valide avec des valeurs par défaut
 */
export const createLoginFormData = (data: Partial<LoginFormData>): LoginFormData => ({
  email: data.email || '',
  password: data.password || '',
});

// ==============================================
// FONCTIONS DE TRANSFORMATION
// ==============================================

/**
 * Transforme des données brutes en un objet Message valide
 * Utile pour les données venant de l'API ou WebSocket
 */
export const transformToMessage = (rawData: any): Message => {
  return createMessage({
    id: rawData.id,
    text: rawData.text || rawData.content || '',
    timestamp: new Date(rawData.timestamp || rawData.createdAt || Date.now()),
    from: rawData.from_me ? 'commercial' : 'client',
    status: rawData.status || 'sent',
    direction: rawData.direction || (rawData.from_me ? 'OUT' : 'IN'),
    sender_phone: rawData.from || rawData.sender_phone,
    sender_name: rawData.from_name || rawData.sender_name || (rawData.from_me ? 'Agent' : 'Client'),
    from_me: !!rawData.from_me,
  });
};

/**
 * Transforme des données brutes en un objet Conversation valide
 * Utile pour les données venant de l'API ou WebSocket
 */
export const transformToConversation = (rawData: any): Conversation => {
  // Extraire les messages si présents
  const messages: Message[] = rawData.messages 
    ? Array.isArray(rawData.messages) 
      ? rawData.messages.map(transformToMessage)
      : []
    : [];

  return createConversation({
    id: rawData.id,
    chat_id: rawData.chat_id || rawData.id,
    clientName: rawData.clientName || rawData.name || 'Client',
    clientPhone: rawData.clientPhone || rawData.chat_id?.split('@')[0] || '',
    lastMessage: rawData.lastMessage || {
      text: rawData.last_message?.text || messages[messages.length - 1]?.text || '',
      timestamp: new Date(rawData.last_message?.timestamp || rawData.updatedAt || Date.now()),
      author: (rawData.last_message?.from_me ? 'agent' : 'client') as 'agent' | 'client',
    },
    messages,
    unreadCount: rawData.unreadCount || rawData.unread_count || 0,
    commercial_id: rawData.commercial_id,
    name: rawData.name || rawData.clientName || 'Conversation',
  });
};

/**
 * Transforme des données brutes en un objet Commercial valide
 * Utile pour les données venant de l'API
 */
export const transformToCommercial = (rawData: any): Commercial => {
  return createCommercial({
    id: rawData.id,
    name: rawData.name || rawData.username || '',
    email: rawData.email,
  });
};

/**
 * Transforme des données brutes en un objet WebSocketMessage valide
 */
export const transformToWebSocketMessage = (rawData: any): WebSocketMessage => {
  let message: Message | undefined;
  let conversation: Conversation | undefined;

  if (rawData.message) {
    message = transformToMessage(rawData.message);
  }

  if (rawData.conversation) {
    conversation = transformToConversation(rawData.conversation);
  }

  return createWebSocketMessage({
    type: rawData.type,
    commercialId: rawData.commercialId || rawData.agentId,
    token: rawData.token,
    conversationId: rawData.conversationId,
    conversation,
    message,
    messageId: rawData.messageId,
    status: rawData.status,
    clientPhone: rawData.clientPhone,
    text: rawData.text || rawData.content,
    timestamp: rawData.timestamp ? new Date(rawData.timestamp) : undefined,
  });
};

// ==============================================
// FONCTIONS DE VALIDATION
// ==============================================

/**
 * Valide si un objet est un Message valide
 */
export const isValidMessage = (data: any): data is Message => {
  console.log("les message transmie", data);
  
  return (
    typeof data === 'object' &&
    data !== null &&
    data.direction==='string'&&
    typeof data.id === 'string' &&
    typeof data.text === 'string' &&
    data.timestamp instanceof Date &&
    data.from === 'string' &&
    typeof data.from_me === 'boolean'
  );
};​

from_me: true​
id: "temp_1768498859084"

sender_name: "bilo"​
sender_phone: "test@tes.co"

status: "sending"​
text: "merci grand"



/**
 * Valide si un objet est une Conversation valide
 */
export const isValidConversation = (data: any): data is Conversation => {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.id === 'string' &&
    typeof data.chat_id === 'string' &&
    typeof data.clientName === 'string' &&
    Array.isArray(data.messages)
  );
};

/**
 * Valide si un objet est un Commercial valide
 */
export const isValidCommercial = (data: any): data is Commercial => {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.id === 'string' &&
    typeof data.name === 'string' &&
    typeof data.email === 'string'
  );
};

// ==============================================
// CONSTANTES UTILES
// ==============================================

export const MESSAGE_STATUSES: MessageStatus[] = ['sending', 'sent', 'delivered', 'read', 'error'];

export const WEBSOCKET_MESSAGE_TYPES = [
  'auth',
  'new_conversation',
  'new_message',
  'message_status',
  'conversation_reassigned',
  'send_message',
] as const;

// ==============================================
// TYPES UTILITAIRES
// ==============================================

/**
 * Type pour les props acceptant des données partielles qui seront transformées
 */
export type PartialOrRaw<T> = Partial<T> | any;

/**
 * Type guard pour MessageStatus
 */
export const isMessageStatus = (status: any): status is MessageStatus => {
  return MESSAGE_STATUSES.includes(status);
};

/**
 * Type guard pour WebSocketMessage type
 */
export const isWebSocketMessageType = (type: any): type is WebSocketMessage['type'] => {
  return WEBSOCKET_MESSAGE_TYPES.includes(type);
};