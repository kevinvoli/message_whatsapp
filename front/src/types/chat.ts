import { MessageDirection } from "../../../message_whatsapp/src/whatsapp_message/entities/whatsapp_message.entity";
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

export interface TypingStore {
  typingChats: Set<string>;
  startTyping: (chatId: string) => void;
  stopTyping: (chatId: string) => void;
}

export interface Message {
  id: string;
  text: string;
  timestamp: Date;

  from: string;
  from_me: boolean;

  from_name?: string;
  chat_id: string;

  status?: "sending" | "sent" | "delivered" | "read" | "error";
  direction?: "IN" | "OUT";

  commercial_id?: string | null;
  poste_id?: string;

  // 🔊 VOCAL (optionnel)
  medias?: Array<{
    id?: string;
    type: "audio" | "voice" | "image" | "video" | "document" | "location";
    url: string;
    mime_type?: string;
    caption?: string;
    file_name?: string;
    file_size?: number;
    duration?: number;
    latitude?: number;
    longitude?: number;
  }>;
}

export interface Poste {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
}

// 🆕 Interface pour les médias au niveau conversation
export interface ConversationMedia {
  media_id: string;
  type: string;
  url?: string; // url peut être optionnelle
  duration_seconds?: number; // convertir string → number
  caption?: string;
  latitude?: number;
  longitude?: number;
}

export interface Conversation {
  id: string;
  chat_id: string;

  poste_id: string;
  poste?: Poste;

  clientName: string;
  clientPhone: string;

  auto_message_status:'scheduled' | 'sending' | 'sent';

  lastMessage: Message | null;
  unreadCount: number;

  // 🆕 Tableau de messages (envoyé par le backend dans conversation:updated)
  messages?: Message[];

  // 🆕 Tableau de médias au niveau conversation
  medias?: ConversationMedia[];

  status: "actif" | "en attente" | "fermé";

  // 🆕 Timestamps backend
  last_client_message_at?: Date | null;
  last_poste_message_at?: Date | null;

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
// INTERFACES POUR LES DONNÉES BRUTES (API / WEBSOCKET)
// ==============================================

// 🔊 Voice tel qu'envoyé par le backend dans chaque message
interface RawVoiceData {
  url: string;
  duration_seconds?: number;
}

// Audio alternatif (si un jour vous changez le backend)
interface RawAudioData {
  url: string;
  duration?: number;
  mime_type?: string;
}

// Média au niveau conversation (tableau medias[] du backend)
interface RawMediaData {
  media_id: string;
  type: string; // "voice" | "image" | ...
  url: string;
  duration_seconds?: number;
  caption?: string;
}

interface RawMessageData {
  id: string;
  text?: string | null;
  timestamp?: string | number | Date;
  createdAt?: string | number | Date;

  from_me: boolean;
  direction?: "IN" | "OUT";
  status?: string;

  from: string;
  from_name?: string;

  commercial_id?: string | null;
  poste_id?: string;
  chat_id: string;

  // 🔊 Voice : c'est ce que le backend envoie réellement
  voice?: RawVoiceData;

  // Audio : interface alternative (pour compatibilité)
  audio?: RawAudioData;
  medias?: Array<{
  id?: string;
  type: 'audio' | 'voice' | 'image' | 'video' | 'document' | 'location';
  url: string;
  mime_type?: string;
  caption?: string;
  file_name?: string;
  file_size?: number;
  duration?: number;
  latitude?: number;
  longitude?: number;
}>;
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

  auto_message_status:'scheduled' | 'sending' | 'sent';

  // 🔥 last_message peut être un objet RawMessageData OU une simple chaîne (ex: "[Media]")
  last_message?: RawMessageData | string | null;

  // 🆕 Tableau complet de messages envoyé par le backend
  messages?: RawMessageData[];

  // 🆕 Tableau de médias au niveau conversation
  medias?: RawMediaData[];

  unread_count?: number;

  status: "actif" | "en attente" | "fermé";

  created_at?: string | number | Date;
  updated_at?: string | number | Date;

  // 🆕 Timestamps du backend
  last_client_message_at?: string | number | Date | null;
  last_poste_message_at?: string | number | Date | null;
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
 *
 * Résout le mapping voice/audio :
 *   - Le backend envoie "voice: { url, duration_seconds }"
 *   - Le frontend utilise "audio: { url, duration, mimeType }"
 */
export const transformToMessage = (raw: RawMessageData): Message => {
  console.log("entre dans transformtoMessage====", raw);

  const hasText = typeof raw.text === "string" && raw.text.trim().length > 0;

  // 🔊 Résolution audio : priorité à "voice" (ce que le backend envoie),
  //    puis fallback sur "audio" pour compatibilité
  let medias: Message["medias"] | undefined;

  return {
    id: raw.id,
    text:
      typeof raw.text === "string" && raw.text.trim().length > 0
        ? raw.text
        : "",
    chat_id: raw.chat_id,

    timestamp: new Date(raw.timestamp || raw.createdAt || Date.now()),

    from: raw.from,
    from_me: Boolean(raw.from_me),
    from_name: raw.from_name || (raw.from_me ? "Agent" : "Client"),
    direction: raw.direction,
    status: raw.status as MessageStatus,

    commercial_id: raw.from_me ? (raw.commercial_id ?? null) : null,
    poste_id: raw.poste_id,

    medias: Array.isArray(raw.medias)
      ? raw.medias.map((m) => ({
          id: m.id,
          type: m.type,
          url: m.url,
          mime_type: m.mime_type,
          caption: m.caption,
          file_name: m.file_name,
          file_size: m.file_size,
          duration: m.duration,
          latitude: m.latitude,
          longitude: m.longitude,
        }))
      : [],
  };
};

/**
 * Transforme un raw médias[] en ConversationMedia[].
 */

const transformMedias = (rawMedias?: any): ConversationMedia[] => {
  if (!rawMedias || rawMedias.length === 0) return [];

  return rawMedias.map(
    (media: {
      media_id: any;
      media_type: any;
      url: any;
      duration_seconds: any;
      caption: any;
      latitude: any;
      longitude: any;
    }) => ({
      media_id: media.media_id,
      type: media.media_type,
      url: media.url ?? undefined,
      duration_seconds: media.duration_seconds
        ? Number(media.duration_seconds)
        : undefined,
      caption: media.caption ?? undefined,
      latitude: media.latitude ? Number(media.latitude) : undefined,
      longitude: media.longitude ? Number(media.longitude) : undefined,
    }),
  );
};

/**
 * Résout last_message qui peut être :
 *   - un objet RawMessageData  → on le transforme normalement
 *   - une string (ex "[Media]") → on crée un Message factice avec cette string
 *   - null/undefined            → null
 */
const resolveLastMessage = (
  raw: RawMessageData | string | null | undefined,
): Message | null => {
  if (!raw) return null;

  // Si c'est déjà un objet avec un "id", c'est un RawMessageData
  if (typeof raw === "object" && "id" in raw) {
    return transformToMessage(raw as RawMessageData);
  }

  // Sinon c'est une string comme "[Media]" — on ne peut pas vraiment créer
  // un Message valide, on retourne null (vous pouvez afficher la string
  // séparément si besoin dans l'UI)
  return null;
};

/**
 * Transforme des données brutes en un objet Conversation valide.
 *
 * Gère :
 *   - last_message polymorphe (objet ou string)
 *   - messages[] (tableau complet)
 *   - medias[] (tableau de médias)
 *   - timestamps last_client_message_at / last_poste_message_at
 */
export const transformToConversation = (
  raw: RawConversationData,
): Conversation => {
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
  clientPhone: raw.client_phone || raw.chat_id?.split("@")[0] || "",

  // 🔥 last_message : résolu via la fonction polymorphe
  lastMessage: resolveLastMessage(raw.last_message),

  // 🆕 messages[] : transforme chaque message du tableau
  messages: raw.messages?.map(transformToMessage) ?? [],

  // 🆕 medias[] : transforme le tableau de médias
  // medias: transformMedias(raw.medias),
  unreadCount: raw.unread_count ?? 0,
  status: raw.status,

  // 🆕 Timestamps
  last_client_message_at: raw.last_client_message_at
    ? new Date(raw.last_client_message_at)
    : null,
  last_poste_message_at: raw.last_poste_message_at
    ? new Date(raw.last_poste_message_at)
    : null,


  auto_message_status: "scheduled",

};
};

/**
 * Transforme des données brutes en un objet Commercial valide.
 */
export const transformToCommercial = (raw: RawCommercialData): Commercial => {
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
export const isValidConversation = (data: unknown): data is Conversation => {
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
