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
  poste_id: string;
  poste?: Poste;
}

export interface Message {
  id: string;
  text: string;
  timestamp: Date;

  from: "commercial" | "client";
  from_me: boolean;

  sender_name?: string;
  sender_phone?: string;

  status?: "sending" | "sent" | "delivered" | "read" | "error";
  direction?: "IN" | "OUT";

  commercial_id?: string | null; // UNIQUEMENT si from_me = true
  poste_id?: string; // toujours présent
}


export interface Poste {
  id: string;
  name: string; // ex: "Service client"
  code: string;
  description?: string;
  isActive: boolean;
}

export interface Conversation {
  id: string;
  chat_id: string;

  poste_id: string;
  poste?: Poste;

  clientName: string;
  clientPhone: string;

  lastMessage: Message | null;
  unreadCount: number;

  status: "actif" | "en attente" | "fermé";

  createdAt: Date;
  updatedAt: Date;
}


export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "error";

export interface WebSocketMessage {
  type:
    | "auth"
    | "new_conversation"
    | "new_message"
    | "message_status"
    | "conversation_reassigned"
    | "send_message";
  commercial_id?: string;
  token?: string;
  conversation_id?: string;
  conversation?: Conversation;
  message?: Message;
  message_id?: string;
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
  timestamp?: string | number | Date;
  createdAt?: string | number | Date;

  from_me: boolean;
  direction: "IN" | "OUT";
  status?: string;

  from: string;
  from_name?: string;

  commercial_id?: string | null;
  poste_id: string;
}

interface RawConversationData {
  id: string;
  chat_id: string;

  poste_id: string;
  poste?: {
    id: string;
    name: string;
    code: string;
  };

  name?: string;
  client_phone?: string;

  last_message?: RawMessageData | null;
  unread_count?: number;

  status: "actif" | "en attente" | "fermé";

  created_at: string | number | Date;
  updated_at: string | number | Date;
}


interface RawCommercialData {
  id: string;
  name?: string;
  username?: string;
  email: string;
  poste_id: string;
  poste?: {
    id: string;
    name: string;
    code: string;
    description?: string;
    isActive?: boolean;
  };
}


// ==============================================
// FONCTIONS DE TRANSFORMATION
// ==============================================

/**
 * Transforme des données brutes en un objet Message valide.
 */
export const transformToMessage = (raw: RawMessageData): Message => ({
  id: raw.id,
  text: raw.text || "",
  timestamp: new Date(raw.timestamp || raw.createdAt || Date.now()),

  from: raw.from_me ? "commercial" : "client",
  from_me: !!raw.from_me,

  sender_phone: raw.from,
  sender_name: raw.from_name || (raw.from_me ? "Agent" : "Client"),

  direction: raw.direction,
  status: raw.status as MessageStatus,

  commercial_id: raw.from_me ? raw.commercial_id ?? null : null,
  poste_id: raw.poste_id,
});


/**
 * Transforme des données brutes en un objet Conversation valide.
 */
export const transformToConversation = (
  raw: RawConversationData,
): Conversation => {
  console.log('=========================================',raw);
  
  return {
    id: raw.id,
    chat_id: raw.chat_id,

    poste_id: raw.poste_id,
    poste: raw.poste
      ? {
          id: raw.poste.id,
          name: raw.poste.name,
          code: raw.poste.code,
          isActive: true,
        }
      : undefined,

    clientName: raw.name || "Client inconnu",
    clientPhone:
      raw.client_phone || raw.chat_id?.split("@")[0] || "",

    lastMessage: raw.last_message
      ? transformToMessage(raw.last_message)
      : null,

    unreadCount: raw.unread_count ?? 0,
    status: raw.status,

    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
  };
};


/**
 * Transforme des données brutes en un objet Commercial valide.
 */
export const transformToCommercial = (
  raw: RawCommercialData,
): Commercial => {
  return {
    id: raw.id,
    name: raw.name || raw.username || "",
    email: raw.email,

    poste_id: raw.poste_id,

    poste: raw.poste
      ? {
          id: raw.poste.id,
          name: raw.poste.name,
          code: raw.poste.code,
          description: raw.poste.description,
          isActive: raw.poste.isActive ?? true,
        }
      : undefined,
  };
};


// ==============================================
// FONCTIONS DE VALIDATION (TYPE GUARDS)
// ==============================================

/**
 * Valide si un objet est un Message valide.
 */
export const isValidMessage = (data: unknown): data is Message => {
  if (typeof data !== "object" || data === null) return false;
  const msg = data as Message;
  return (
    typeof msg.id === "string" &&
    typeof msg.text === "string" &&
    msg.timestamp instanceof Date &&
    typeof msg.from === "string" &&
    typeof msg.from_me === "boolean"
  );
};

/**
 * Valide si un objet est une Conversation valide.
 */
export const isValidConversation = (
  data: unknown,
): data is Conversation => {
  if (typeof data !== "object" || data === null) return false;

  const conv = data as Conversation;

  return (
    typeof conv.id === "string" &&
    typeof conv.chat_id === "string" &&
    typeof conv.poste_id === "string" &&
    typeof conv.clientName === "string" &&
    typeof conv.clientPhone === "string" &&
    typeof conv.unreadCount === "number" &&
    ["actif", "en attente", "fermé"].includes(conv.status)
  );
};


/**
 * Valide si un objet est un Commercial valide.
 */
export const isValidCommercial = (data: unknown): data is Commercial => {
  if (typeof data !== "object" || data === null) return false;
  const com = data as Commercial;
  return (
    typeof com.id === "string" &&
    typeof com.name === "string" &&
    typeof com.email === "string"
  );
};

// ==============================================
// CONSTANTES ET TYPES UTILITAIRES
// ==============================================

export const MESSAGE_STATUSES: MessageStatus[] = [
  "sending",
  "sent",
  "delivered",
  "read",
  "error",
];
export const WEBSOCKET_MESSAGE_TYPES = [
  "auth",
  "new_conversation",
  "new_message",
  "message_status",
  "conversation_reassigned",
  "send_message",
] as const;

/**
 * Type guard pour MessageStatus.
 */
export const isMessageStatus = (status: unknown): status is MessageStatus => {
  return (
    typeof status === "string" &&
    MESSAGE_STATUSES.includes(status as MessageStatus)
  );
};

/**
 * Type guard pour WebSocketMessage type.
 */
export const isWebSocketMessageType = (
  type: unknown,
): type is WebSocketMessage["type"] => {
  return (
    typeof type === "string" &&
    WEBSOCKET_MESSAGE_TYPES.includes(type as WebSocketMessage["type"])
  );
};
