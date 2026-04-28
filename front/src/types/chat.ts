/**
 * @fileoverview Ce fichier définit les types et interfaces principaux utilisés
 * dans l'application de chat, ainsi que des fonctions utilitaires pour
 * créer, transformer et valider ces objets.
 */
export type ConversationStatus =
  | "nouveau"
  | "actif"
  | "attente"
  | "converti"
  | "fermé";

export type ConversationResult =
  | 'commande_confirmee'
  | 'commande_a_saisir'
  | 'a_relancer'
  | 'rappel_programme'
  | 'pas_interesse'
  | 'sans_reponse'
  | 'infos_incompletes'
  | 'deja_client'
  | 'annule';

export const CONVERSATION_RESULT_LABELS: Record<ConversationResult, string> = {
  commande_confirmee:  'Commande confirmée',
  commande_a_saisir:   'Commande à saisir',
  a_relancer:          'À relancer',
  rappel_programme:    'Rappel programmé',
  pas_interesse:       'Pas intéressé',
  sans_reponse:        'Sans réponse',
  infos_incompletes:   'Infos incomplètes',
  deja_client:         'Déjà client',
  annule:              'Annulé',
};

export const CONVERSATION_RESULT_COLORS: Record<ConversationResult, string> = {
  commande_confirmee:  'bg-green-100 text-green-700',
  commande_a_saisir:   'bg-blue-100 text-blue-700',
  a_relancer:          'bg-orange-100 text-orange-700',
  rappel_programme:    'bg-sky-100 text-sky-700',
  pas_interesse:       'bg-gray-100 text-gray-600',
  sans_reponse:        'bg-yellow-100 text-yellow-700',
  infos_incompletes:   'bg-purple-100 text-purple-700',
  deja_client:         'bg-teal-100 text-teal-700',
  annule:              'bg-red-100 text-red-700',
};

export type FollowUpType =
  | 'rappel'
  | 'relance_post_conversation'
  | 'relance_sans_commande'
  | 'relance_post_annulation'
  | 'relance_fidelisation'
  | 'relance_sans_reponse';

export type FollowUpStatus = 'planifiee' | 'en_retard' | 'effectuee' | 'annulee';

export const FOLLOW_UP_TYPE_LABELS: Record<FollowUpType, string> = {
  rappel:                    'Rappel',
  relance_post_conversation: 'Relance post-conversation',
  relance_sans_commande:     'Relance sans commande',
  relance_post_annulation:   'Relance post-annulation',
  relance_fidelisation:      'Relance fidélisation',
  relance_sans_reponse:      'Relance sans réponse',
};

export interface FollowUp {
  id: string;
  contact_id?: string | null;
  conversation_id?: string | null;
  commercial_id?: string | null;
  commercial_name?: string | null;
  type: FollowUpType;
  status: FollowUpStatus;
  scheduled_at: string;
  completed_at?: string | null;
  result?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ViewMode = 'conversations' | 'contacts' | 'relances' | 'objectifs' | 'ranking' | 'menus-metier' | 'action-queue' | 'dashboard'

export type Priority = "haute" | "moyenne" | "basse";

export type CallStatus = "à_appeler" | "appelé" | "rappeler" | "non_joignable";

export type Source = {
  name: string;
  value: number;
  color: string;
};

export type PerformanceData = {
  jour: string;
  conversions: number;
};



export type Stats = {
  messagesTraites: number;
  tauxReponse: number;
  tempsReponse: string;
  conversationsActives: number;
  conversionsJour: number;
  satisfaction: number;
  objectifJour: number;
  ca: number;
  nouveauxContacts: number;
  relances: number;
  rdvPris: number;
  tauxConversion: number;
  messagesMoyen: number;
  horairesPic: string;
  sourcesPrincipales: Source[];
  performanceHebdo: PerformanceData[];
};

export type StatsState = {
  stats: Stats | null;
  loading: boolean;
  error: string | null;

  // Actions
  setStats: (stats: Stats) => void;
  updateStats: (updates: Partial<Stats>) => void;
};

export const getPriorityColor = (
  priority: "haute" | "moyenne" | "basse" | string,
) => {
  switch (priority) {
    case "haute":
      return "text-red-600";
    case "moyenne":
      return "text-orange-600";
    case "basse":
      return "text-gray-600";
    default:
      return "text-gray-600";
  }
};

export const getCallStatusColor = (status: CallStatus): string => {
  switch (status) {
    case "appelé":
      return "text-green-600 bg-green-50";
    case "à_appeler":
      return "text-blue-600 bg-blue-50";
    case "rappeler":
      return "text-orange-600 bg-orange-50";
    case "non_joignable":
      return "text-gray-600 bg-gray-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
};



export const getCallStatusLabel = (status: CallStatus): string => {
  switch (status) {
    case "appelé":
      return "Appelé";
    case "à_appeler":
      return "À appeler";
    case "rappeler":
      return "À rappeler";
    case "non_joignable":
      return "Non joignable";
    default:
      return "À appeler";
  }
};





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

  status?: MessageStatus;
  direction?: "IN" | "OUT";

  commercial_id?: string | null;
  poste_id?: string;
  dedicated_channel_id?: string | null;

  // 🔊 VOCAL (optionnel)
  medias?: Array<{
    id?: string;
    type: "audio" | "voice" | "image" | "video" | "document" | "location" | "live_location" | "sticker";
    url: string;
    mime_type?: string;
    caption?: string;
    file_name?: string;
    file_size?: number;
    duration?: number;
    latitude?: number;
    longitude?: number;
  }>;

  // 💬 Message cité (reply)
  quotedMessage?: {
    id: string;
    text?: string;
    from_name?: string;
    from_me?: boolean;
  };
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

export interface CallHistory {
  id: string;
  conversation_id: string;
  contact_id: string;
  commercial_id: string;
  call_date: Date;
  call_status: CallStatus;
  duration?: number; // durée en secondes
  notes?: string;
  outcome?: "répondu" | "messagerie" | "pas_de_réponse" | "occupé";
  next_call_date?: Date;
  created_at: Date;
  updated_at: Date;
}

export type CallOutcome = "répondu" | "messagerie" | "pas_de_réponse" | "occupé";

/** Entrée d'historique d'appel (ticket F-01) */
export interface CallLog {
  id: string;
  contact_id: string;
  commercial_id: string;
  commercial_name: string;
  called_at: Date;
  call_status: CallStatus;
  outcome?: CallOutcome;
  duration_sec?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const transformToCallLog = (raw: Record<string, any>): CallLog => ({
  id: raw.id,
  contact_id: raw.contact_id,
  commercial_id: raw.commercial_id,
  commercial_name: raw.commercial_name ?? '',
  called_at: new Date(raw.called_at),
  call_status: raw.call_status as CallStatus,
  outcome: raw.outcome as CallOutcome | undefined,
  duration_sec: raw.duration_sec ?? undefined,
  notes: raw.notes ?? undefined,
  createdAt: new Date(raw.createdAt),
  updatedAt: new Date(raw.updatedAt),
});

/** Résumé léger du contact embarqué dans chaque conversation (chargé en batch au connect). */
export interface ContactSummary {
  id: string;
  call_status: CallStatus;
  call_count: number;
  priority?: Priority | null;
  source?: string | null;
  tags?: string[];
  conversion_status?: string | null;
  last_call_date?: Date | null;
  is_active: boolean;
}

export interface Contact {
  id: string;
  name: string;
  contact: string; // numéro de téléphone
  chat_id: string;
  is_active: boolean;
  
  // Informations d'appel
  call_status: CallStatus;
  last_call_date?: Date;
  last_call_outcome?: string;
  next_call_date?: Date;
  call_count: number;
  call_notes?: string;
  
  // Statistiques
  total_messages?: number;
  last_message_date?: Date;
  conversion_status?: "nouveau" | "prospect" | "client" | "perdu";
  messages?: Message[];
  // Métadonnées
  source?: string;
  priority?: Priority;
  tags?: string[];
  
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;

  // Champs intégration ERP (synchronisés via webhook)
  client_category?: 'jamais_commande' | 'commande_sans_livraison' | 'commande_avec_livraison' | 'commande_annulee' | null;
  order_client_id?: number | null;
  referral_code?: string | null;
  referral_count?: number | null;
  referral_commission?: number | null;
}

export interface Conversation {
  id: string;
  chat_id: string;

  poste_id: string;
  poste?: Poste;

  clientName: string;
  clientPhone: string;

  readonly?: boolean;
  channel_dedicated?: boolean;

  lastMessage: Message | null;
  unreadCount: number;

  messages?: Message[];
  medias?: ConversationMedia[];

  status: ConversationStatus;
  source: string;
  priority: Priority;
  tags: string[];
  
  // 🆕 Informations d'appel
  call_status?: CallStatus;
  last_call_date?: Date | null;
  last_call_notes?: string;
  next_call_date?: Date | null;
  
  // Timestamps backend
  last_client_message_at?: Date | null;
  last_poste_message_at?: Date | null;
  last_activity_at?: Date | null;
  
  // SLA
  first_response_deadline_at?: Date | null;

  // 🆕 Date de conversion/fermeture
  closed_at?: Date | null;
  converted_at?: Date | null;
  closed_by?: string;

  // P7 — Statut métier
  conversation_result?: ConversationResult | null;
  conversation_result_at?: Date | null;

  /** Données du contact associé, chargées en batch avec les conversations. */
  contact_summary?: ContactSummary | null;

  /** 4.15 — Conversation verrouillée (quota actif dépassé) */
  is_locked?: boolean;

  /** Phase 9 — Fenêtre glissante */
  window_slot?: number | null;
  window_status?: 'active' | 'locked' | 'released' | null;
  validation_state?: ValidationCriterionState[] | null;

  /** Statut de soumission du rapport GICOP */
  report_submission_status?: 'pending' | 'sent' | 'failed' | null;

  /** Conversation rouverte après soumission de rapport — traitement urgent */
  is_priority?: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface ValidationCriterionState {
  type: string;
  label: string;
  required: boolean;
  validated: boolean;
  validatedAt: Date | null;
}

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "error";

export interface ConversationAction {
  type: "close" | "convert" | "reopen" | "mark_call" | "update_priority" | "add_tag";
  conversation_id: string;
  commercial_id: string;
  data?: {
    status?: ConversationStatus;
    call_status?: CallStatus;
    call_notes?: string;
    priority?: Priority;
    tag?: string;
  };
  timestamp: Date;
}

export interface WebSocketMessage {
  type:
    | "auth"
    | "new_conversation"
    | "new_message"
    | "message_status"
    | "conversation_reassigned"
    | "send_message"
    | "conversation_updated"
    | "call_marked"
    | "status_changed";
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
  action?: ConversationAction;
}

export interface LoginFormData {
  email: string;
  password: string;
}


// ==============================================
// INTERFACES POUR FILTRES ET VUES
// ==============================================


export interface ContactFilters {
  search?: string;
  call_status?: CallStatus[];
  conversion_status?: string[];
  source?: string[];
  priority?: Priority[];
  date_range?: {
    start: Date;
    end: Date;
  };
  has_upcoming_call?: boolean;
  sort_by?: "name" | "last_call" | "next_call" | "priority" | "created_at";
  sort_order?: "asc" | "desc";
}

export interface ConversationFilters {
  status?: ConversationStatus[];
  priority?: Priority[];
  call_status?: CallStatus[];
  poste_id?: string[];
  has_unread?: boolean;
  date_range?: {
    start: Date;
    end: Date;
  };
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
  text?: string | { body?: string } | null;
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
    type: "audio" | "voice" | "image" | "video" | "document" | "location" | "live_location" | "sticker";
    url: string;
    mime_type?: string;
    caption?: string;
    file_name?: string;
    file_size?: number;
    duration?: number;
    seconds?: number;
    latitude?: number;
    longitude?: number;
  }>;

  // 💬 Message cité (reply)
  quotedMessage?: {
    id: string;
    text?: string;
    from_name?: string;
    from_me?: boolean;
  };
}

interface RawConversationData {
  id: string;
  chat_id: string;

  poste_id?: string;
  poste?: {
    id: string;
    name: string;
    code: string;
  };
  tags?: string[];
  priority: Priority;
  name?: string;
  client_phone?: string;
  contact_client?: string;
  last_msg_client_channel_id?: string;

  last_message?: RawMessageData | string | null;
  messages?: RawMessageData[];
  medias?: RawMediaData[];

  unreadCount?: number;
  unread_count?: number;

  status?: ConversationStatus | string;
  channel_id?: string;
  channel?: { poste_id?: string | null } | null;

  // 🆕 Champs d'appel
  call_status?: CallStatus;
  last_call_date?: string | number | Date | null;
  last_call_notes?: string;
  next_call_date?: string | number | Date | null;
  
  created_at?: string | number | Date;
  updated_at?: string | number | Date;

  last_client_message_at?: string | number | Date | null;
  last_poste_message_at?: string | number | Date | null;
  last_activity_at?: string | number | Date | null;
  
  first_response_deadline_at?: string | number | Date | null;
  closed_at?: string | number | Date | null;
  converted_at?: string | number | Date | null;
  closed_by?: string;
  read_only?: boolean;
  conversation_result?: string | null;
  conversation_result_at?: string | number | Date | null;
  channel_dedicated?: boolean;
  createdAt?: string | number | Date;
  updatedAt?: string | number | Date;
  contact_summary?: {
    id: string;
    call_status?: string;
    call_count?: number;
    priority?: string | null;
    source?: string | null;
    tags?: string[];
    conversion_status?: string | null;
    last_call_date?: string | Date | null;
    is_active?: boolean;
  } | null;
  is_locked?: boolean;
  is_priority?: boolean;
  window_slot?: number | null;
  window_status?: string | null;
  validation_state?: any[] | null;
  report_submission_status?: string | null;
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

interface RawContactData {
  id: string;
  name: string;
  phone: string;
  chat_id: string;
  is_active: boolean;
  
  call_status?: CallStatus;
  last_call_date?: string | number | Date | null;
  last_call_outcome?: string;
  next_call_date?: string | number | Date | null;
  call_count?: number;
  call_notes?: string;
  
  total_messages?: number;
  last_message_date?: string | number | Date | null;
  conversion_status?: string;
  
  source?: string;
  priority?: Priority;
  tags?: string[];
  
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
  deletedAt?: string | number | Date | null;
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
  // console.log("entre dans transformtoMessage====",new Date(raw.timestamp?? Date.now()) );

  const hasText = typeof raw.text === "string" && raw.text.trim().length > 0;

  // 🔊 Résolution audio : priorité à "voice" (ce que le backend envoie),
  //    puis fallback sur "audio" pour compatibilité
  let medias: Message["medias"] | undefined;

  const resolveText = (value: RawMessageData["text"]) => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && typeof value.body === "string") {
      return value.body;
    }
    return "";
  };

  const normalizedText = resolveText(raw.text);

  return {
    id: raw.id,
    text: normalizedText,
    chat_id: raw.chat_id,

    timestamp: raw.timestamp
      ? new Date(raw.timestamp)
      : raw.createdAt
        ? new Date(raw.createdAt)
        : new Date(0),
    //,
    // timestamp: raw.timestamp,
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
          duration: m.duration ?? m.seconds,
          latitude: m.latitude,
          longitude: m.longitude,
        }))
      : [],

    quotedMessage: raw.quotedMessage
      ? {
          id: raw.quotedMessage.id,
          text: raw.quotedMessage.text,
          from_name: raw.quotedMessage.from_name,
          from_me: raw.quotedMessage.from_me,
        }
      : undefined,
  };
};

/**
 * Transforme un raw médias[] en ConversationMedia[].
 */

// const transformMedias = (rawMedias?: any): ConversationMedia[] => {
//   if (!rawMedias || rawMedias.length === 0) return [];

//   return rawMedias.map(
//     (media: {
//       media_id: string;
//       media_type: string;
//       url: string;
//       duration_seconds: number | null;
//       caption: string;
//       latitude: string | number;
//       longitude: string | number;
//     }) => ({
//       media_id: media.media_id,
//       type: media.media_type,
//       url: media.url ?? undefined,
//       duration_seconds: media.duration_seconds
//         ? Number(media.duration_seconds)
//         : undefined,
//       caption: media.caption ?? undefined,
//       latitude: media.latitude ? Number(media.latitude) : undefined,
//       longitude: media.longitude ? Number(media.longitude) : undefined,
//     }),
//   );
// };

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
  // console.log("transforme message ", raw);

  // Si c'est déjà un objet avec un "id", c'est un RawMessageData
  if (typeof raw === "object" && "id" in raw) {
    return transformToMessage(raw as RawMessageData);
  }

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
  // Le backend normalise déjà 'en attente' → 'attente' à la source (mapConversation).
  // Ce fallback ne couvre plus le cas !raw.status (null → 'attente' silencieux)
  // car cela polluait le filtre "Nouveaux". Un statut absent est une anomalie de données :
  // on le laisse passer tel quel et le bug de données doit être corrigé en amont.
  const normalizedStatus: ConversationStatus =
    raw.status === "en attente" ? "attente"
    : (raw.status as ConversationStatus) ?? "attente";
  const unreadCount = raw.unreadCount ?? raw.unread_count ?? 0;
  const sourceChannel =
    raw.channel_id || raw.last_msg_client_channel_id || "inconnu";

  return {
    id: raw.id,
    chat_id: raw.chat_id,

    poste_id: raw.poste_id ?? raw.poste?.id ?? "",
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
      raw.client_phone || raw.contact_client || raw.chat_id?.split("@")[0] || "",

    lastMessage: resolveLastMessage(raw.last_message),
    messages: raw.messages?.map(transformToMessage) ?? [],

    unreadCount,
    status: normalizedStatus,

    // 🆕 Champs d'appel transformés
    call_status: raw.call_status,
    last_call_date: raw.last_call_date ? new Date(raw.last_call_date) : null,
    last_call_notes: raw.last_call_notes,
    next_call_date: raw.next_call_date ? new Date(raw.next_call_date) : null,

    last_client_message_at: raw.last_client_message_at
      ? new Date(raw.last_client_message_at)
      : null,
    last_poste_message_at: raw.last_poste_message_at
      ? new Date(raw.last_poste_message_at)
      : null,
    last_activity_at: raw.last_activity_at
      ? new Date(raw.last_activity_at)
      : null,

    source: sourceChannel,
    // priority vit sur le Contact, pas sur WhatsappChat.
    // Le chargement initial (CONVERSATION_LIST) l'envoie via contact_summary.priority.
    // Les événements UPSERT ultérieurs ne l'incluent pas → on préfère contact_summary
    // pour éviter que le fallback "moyenne" n'écrase une vraie valeur "haute".
    priority: (raw.priority ?? raw.contact_summary?.priority ?? "moyenne") as Priority,
    tags: raw.tags || [],

    readonly: raw.read_only ?? undefined,
    channel_dedicated: raw.channel_dedicated ?? !!(raw.channel?.poste_id),

    first_response_deadline_at: raw.first_response_deadline_at
      ? new Date(raw.first_response_deadline_at)
      : null,
    closed_at: raw.closed_at ? new Date(raw.closed_at) : null,
    converted_at: raw.converted_at ? new Date(raw.converted_at) : null,
    closed_by: raw.closed_by,

    conversation_result: (raw.conversation_result as ConversationResult) ?? null,
    conversation_result_at: raw.conversation_result_at ? new Date(raw.conversation_result_at) : null,

    contact_summary: raw.contact_summary
      ? {
          id: raw.contact_summary.id,
          call_status: (raw.contact_summary.call_status as CallStatus) || 'à_appeler',
          call_count: raw.contact_summary.call_count ?? 0,
          priority: (raw.contact_summary.priority as Priority) ?? null,
          source: raw.contact_summary.source ?? null,
          tags: raw.contact_summary.tags ?? [],
          conversion_status: raw.contact_summary.conversion_status ?? null,
          last_call_date: raw.contact_summary.last_call_date
            ? new Date(raw.contact_summary.last_call_date)
            : null,
          is_active: raw.contact_summary.is_active ?? true,
        }
      : null,

    is_locked: raw.is_locked === true,
    is_priority: raw.is_priority === true,

    window_slot: raw.window_slot ?? null,
    window_status: (raw.window_status ?? null) as Conversation['window_status'],
    report_submission_status: raw.report_submission_status !== undefined
      ? (raw.report_submission_status as Conversation['report_submission_status'])
      : undefined,
    validation_state: Array.isArray(raw.validation_state)
      ? raw.validation_state.map((c: any) => ({
          type: c.type,
          label: c.label,
          required: c.required,
          validated: c.validated,
          validatedAt: c.validatedAt ? new Date(c.validatedAt) : null,
        }))
      : null,

    createdAt: new Date(raw.created_at ?? raw.createdAt ?? Date.now()),
    updatedAt: new Date(raw.updated_at ?? raw.updatedAt ?? Date.now()),
  };
};
/**
 * Crée un objet Contact léger depuis une Conversation + son contact_summary.
 * Retourne null si la conversation n'a pas de contact associé.
 */
export const convToContact = (conv: Conversation): Contact | null => {
  const s = conv.contact_summary;
  if (!s) return null;
  return {
    id: s.id,
    name: conv.clientName,
    contact: conv.clientPhone,
    chat_id: conv.chat_id,
    is_active: s.is_active,
    call_status: s.call_status,
    call_count: s.call_count,
    priority: s.priority ?? undefined,
    source: s.source ?? undefined,
    tags: s.tags ?? [],
    conversion_status: (s.conversion_status as Contact['conversion_status']) ?? undefined,
    last_call_date: s.last_call_date ?? undefined,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
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

export const transformToContact = (raw: RawContactData): Contact => {
  return {
    id: raw.id,
    name: raw.name,
    contact: raw.phone,
    chat_id: raw.chat_id,
    is_active: raw.is_active,
    
    call_status: raw.call_status || "à_appeler",
    last_call_date: raw.last_call_date ? new Date(raw.last_call_date) : undefined,
    last_call_outcome: raw.last_call_outcome,
    next_call_date: raw.next_call_date ? new Date(raw.next_call_date) : undefined,
    call_count: raw.call_count || 0,
    call_notes: raw.call_notes,
    
    total_messages: raw.total_messages,
    last_message_date: raw.last_message_date ? new Date(raw.last_message_date) : undefined,
    conversion_status: raw.conversion_status as any,
    
    source: raw.source,
    priority: raw.priority,
    tags: raw.tags,
    
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    deletedAt: raw.deletedAt ? new Date(raw.deletedAt) : undefined,
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
    ["actif", "attente", "en attente", "fermé"].includes(conv.status)
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
  "conversation_updated",
  "call_marked",
  "status_changed",
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


