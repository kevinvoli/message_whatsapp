import React from 'react';

// ============================================
// TYPES EXISTANTS (conservés)
// ============================================

export type Commercial = {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline';
  email: string;
  region: string;
  dernierLogin: string;
  messagesEnvoyes: number;
  messagesRecus: number;
  conversationsActives: number;
  conversationsEnAttente: number;
  nouveauxContacts: number;
  productivite: number;
};

export type ViewMode =
  | 'overview'
  | 'commerciaux'
  | 'performance'
  | 'analytics'
  | 'messages'
  | 'clients'
  | 'rapports'
  | 'postes'
  | 'canaux'
  | 'automessages'
  | 'conversations'
  | 'queue'
  | 'dispatch'
  | 'crons'
  | 'canned_responses'
  | 'tags'
  | 'observabilite'
  | 'go_no_go'
  | 'notifications'
  | 'settings'
  | 'feature_flags';

export type NavigationItem = {
  id: ViewMode;
  name: string;
  icon: React.ElementType;
  badge: string | null;
};

export type NavigationGroup = {
  label: string;
  icon: React.ElementType;
  items: NavigationItem[];
};

export type StatsGlobales = {
  commerciaux: number;
  canaux: number;
  conversations: number;
  commerciauxActifs: number;
};

export type PerformanceData = {
  jour: string;
  conversions: number;
  ca: number;
  messages: number;
  rdv: number;
};

export type SourcesClients = {
  name: string;
  value: number;
  conversions: number;
  color: string;
};

export type HeuresActivite = {
  heure: string;
  activite: number;
};

export type ProduitsPopulaires = {
  nom: string;
  ventes: number;
  ca: number;
};

export type Poste = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  is_queue_enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
  chats?: WhatsappChat[] | null;
  messages?: WhatsappMessage[] | null;
  commercial?: Commercial[] | null;
};

export type ProviderType = 'whapi' | 'meta' | 'messenger' | 'instagram' | 'telegram';

export type Channel = {
  id: string;
  tenant_id?: string | null;
  label?: string | null;
  provider?: ProviderType | null;
  external_id?: string | null;
  channel_id: string;
  token: string;
  meta_app_id?: string | null;
  meta_app_secret?: string | null;
  verify_token?: string | null;
  webhook_secret?: string | null;
  start_at: number;
  uptime: number;
  version: string;
  device_id: number;
  ip: string;
  is_business: boolean;
  api_version: string;
  core_version: string;
  tokenExpiresAt?: string | null;
  meta_account_status?: string | null;
  meta_account_status_updated_at?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageAuto = {
  id: string;
  body: string;
  delai?: number | null;
  canal?: 'whatsapp' | 'sms' | 'email' | null;
  position: number;
  actif: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Client = {
  id: string;
  name: string;
  phone: string;
  chat_id?: string;
  is_active: boolean;
  call_status?: string;
  last_call_date?: string | null;
  last_call_outcome?: string | null;
  next_call_date?: string | null;
  call_count?: number;
  call_notes?: string | null;
  total_messages?: number;
  last_message_date?: string | null;
  conversion_status?: string | null;
  source?: string | null;
  priority?: string | null;
  marketing_opt_out?: boolean;
  messages?: WhatsappMessage[];
  createdAt: string;
  updatedAt: string;
};

export type WhatsappMessage = {
  id: string;
  message_id?: string | null;
  external_id?: string;
  chat_id: string;
  channel_id?: string;
  text: string;
  type?: string;
  direction: 'IN' | 'OUT';
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  timestamp: string;
  mediaUrl?: string;
  mediaType?: string;
  medias?: Array<{
    id?: string;
    type?: string;
    url?: string;
    mime_type?: string;
    caption?: string;
    file_name?: string;
    file_size?: number;
    seconds?: number;
    latitude?: number;
    longitude?: number;
  }>;
  poste?: Poste;
  poste_id?: string | null;
  commercial?: Commercial;
  commercial_id?: string | null;
  from?: string;
  from_name?: string;
  source?: string;
  caption?: string;
  is_deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WhatsappChat = {
  id: string;
  chat_id: string;
  channel_id?: string;
  last_msg_client_channel_id?: string;
  poste_id?: string;
  name: string;
  type: string;
  chat_pic: string;
  chat_pic_full: string;
  is_pinned: boolean;
  is_muted: boolean;
  mute_until: string | null;
  is_archived: boolean;
  unread_count: number;
  unreadCount?: number;
  status?: 'actif' | 'attente' | 'en attente' | 'fermé' | 'nouveau' | 'converti';
  unread_mention: boolean;
  read_only: boolean;
  not_spam: boolean;
  contact_client: string;
  client_phone?: string;
  assigned_at?: string | null;
  assigned_mode?: 'ONLINE' | 'OFFLINE' | null;
  first_response_deadline_at?: string | null;
  last_client_message_at?: string | null;
  last_poste_message_at?: string | null;
  auto_message_id?: string | null;
  current_auto_message_id?: string | null;
  auto_message_status?: string | null;
  auto_message_step?: number;
  waiting_client_reply?: boolean;
  last_auto_message_sent_at?: string | null;
  last_activity_at: string;
  createdAt: string;
  updatedAt: string;
  last_message?: WhatsappMessage | null;
  channel?: Channel;
  contact?: Client;
  poste: Poste;
  messages: WhatsappMessage[];
};

export type QueuePosition = {
  id: string;
  poste_id: string;
  position: number;
  addedAt?: string;
  updatedAt?: string;
  poste?: Poste;
};

export type DispatchSnapshot = {
  queue_size: number;
  waiting_count: number;
  waiting_items: Array<{
    id: string;
    chat_id: string;
    status: string;
    poste_id?: string | null;
    assigned_at?: string | null;
    last_client_message_at?: string | null;
    first_response_deadline_at?: string | null;
    poste?: Poste | null;
  }>;
};

export type DispatchSettings = {
  id?: string;
  no_reply_reinject_interval_minutes: number;
  read_only_check_interval_minutes: number;
  offline_reinject_cron: string;
  auto_message_enabled: boolean;
  auto_message_delay_min_seconds: number;
  auto_message_delay_max_seconds: number;
  auto_message_max_steps: number;
};

export type CannedResponse = {
  id: string;
  shortcut: string;
  title: string;
  content: string;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageTemplateStatus = {
  id: string;
  templateName: string;
  language: string;
  status: string;
  qualityScore?: string | null;
  lastCheckedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConversationNote = {
  id: string;
  chatId: string;
  authorId: string;
  authorName?: string | null;
  authorType: 'commercial' | 'admin';
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationTag = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export type AutoMessageScopeType = 'poste' | 'canal' | 'provider';

export type AutoMessageScopeConfig = {
  id: string;
  scope_type: AutoMessageScopeType;
  scope_id: string;
  label?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DispatchSettingsAudit = {
  id: string;
  settings_id: string;
  payload: string;
  createdAt: string;
};

// ============================================
// NOUVEAUX TYPES POUR LES MÉTRIQUES OVERVIEW
// ============================================

/**
 * Métriques globales pour le dashboard Overview
 * Basées sur votre structure de base de données existante
 */
export type MetriquesGlobales = {
  // Métriques Messages
  totalMessages: number;
  messagesEntrants: number;
  messagesSortants: number;
  messagesAujourdhui: number;
  tauxReponse: number;
  tempsReponseMoyen: number;

  // Métriques Chats
  totalChats: number;
  chatsActifs: number;
  chatsEnAttente: number;
  chatsFermes: number;
  chatsNonLus: number;
  chatsArchives: number;

  // Métriques Commerciaux
  commerciauxTotal: number;
  commerciauxConnectes: number;
  commerciauxActifs: number;

  // Métriques Contacts
  totalContacts: number;
  nouveauxContactsAujourdhui: number;
  contactsActifs: number;

  // Métriques Postes
  totalPostes: number;
  postesActifs: number;
  chargePostes: ChargePoste[];

  // Métriques Channels
  totalChannels: number;
  channelsActifs: number;

  // Métriques Performance
  messagesEnAttente: number;
  tauxAssignation: number;
  tempsPremiereReponse: number;
  chatsSlaDepasses?: number;

  // Variations vs période précédente (null = données insuffisantes)
  variations?: Record<string, number | null>;
};

export type FeatureFlagEntry = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  envVar: string;
  category: 'security' | 'resilience' | 'messaging' | 'infra';
};

/**
 * Charge de travail par poste
 */
export type ChargePoste = {
  poste_id: string;
  poste_name: string;
  poste_code: string;
  nb_chats: number;
  nb_chats_actifs: number;
  nb_chats_attente: number;
};

/**
 * Statistiques de conversations par poste
 */
export type PosteStats = {
  poste_id: string;
  poste_name: string;
  poste_code: string;
  total: number;
  actif: number;
  en_attente: number;
  ferme: number;
  unread_total: number;
};

/**
 * Statistiques de conversations par commercial
 */
export type CommercialStats = {
  commercial_id: string;
  commercial_name: string;
  commercial_email: string;
  poste_id: string | null;
  poste_name: string | null;
  conversations_count: number;
  messages_sent: number;
  isConnected: boolean;
};

/**
 * Performance détaillée d'un commercial
 */
export type PerformanceCommercial = {
  id: string;
  name: string;
  email: string;
  isConnected: boolean;
  poste_name: string;
  poste_id: string | null;
  nbChatsActifs: number;
  nbMessagesEnvoyes: number;
  nbMessagesRecus: number;
  tauxReponse: number;
  tempsReponseMoyen: number;
  lastConnectionAt: string | null;
};

/**
 * Statut détaillé d'un channel WhatsApp
 */
export type StatutChannel = {
  id: string;
  channel_id: string;
  is_business: boolean;
  uptime: number;
  version: string;
  api_version: string;
  core_version: string;
  ip: string;
  nb_chats_actifs: number;
  nb_messages: number;
};

/**
 * Données de performance sur une période
 */
export type PerformanceTemporelle = {
  periode: string;
  nb_messages: number;
  messages_in: number;
  messages_out: number;
  nb_conversations?: number;
  nb_commerciaux_actifs?: number;
};

/**
 * Statistiques par type de message
 */
export type StatistiquesParType = {
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  count: number;
  percentage?: number;
};

/**
 * Nouveaux contacts par jour
 */
export type NouveauxContactsParJour = {
  date: string;
  nb_nouveaux_contacts: number;
};

/**
 * Alertes et notifications
 */
export type Alerte = {
  type: 'warning' | 'error' | 'info' | 'success';
  titre: string;
  message: string;
  count?: number;
  action?: string;
};

/**
 * Props du composant OverviewView
 */
export type OverviewViewProps = {
  metriques: MetriquesGlobales;
  performanceCommercial: PerformanceCommercial[];
  statutChannels: StatutChannel[];
  performanceTemporelle?: PerformanceTemporelle[];
  alertes?: Alerte[];
};

export type WebhookMetricsSnapshot = {
  counters: Record<string, number>;
  latency: Record<string, { p95: number; p99: number }>;
  generated_at: string;
  window_minutes: number;
};

export type GoNoGoGateStatus = 'pass' | 'warn' | 'fail' | 'pending';

export type GoNoGoGate = {
  id: string;
  title: string;
  description?: string;
  status: GoNoGoGateStatus;
  detail?: string;
};

export type GoNoGoChecklistItem = {
  id: string;
  title: string;
  owner: string;
  status: GoNoGoGateStatus;
  lastRun?: string;
  detail?: string;
};

// ============================================
// TYPES UTILITAIRES
// ============================================

export type StatutChat = 'actif' | 'en attente' | 'fermé';
export type DirectionMessage = 'IN' | 'OUT';
export type TypeMessage = 'text' | 'image' | 'audio' | 'video' | 'document';
export type StatutMessage = 'failed' | 'pending' | 'sent' | 'delivered' | 'read' | 'played' | 'deleted';
export type ModeAssignation = 'ONLINE' | 'OFFLINE';

/**
 * Filtre pour les requêtes de métriques
 */
export type FiltreMetriques = {
  dateDebut?: string;
  dateFin?: string;
  commercialIds?: string[];
  posteIds?: string[];
  channelIds?: string[];
  statutChats?: StatutChat[];
};

// ============================================
// CRON CONFIG
// ============================================

export type CronScheduleType = 'interval' | 'cron' | 'event';

export type CronConfig = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  scheduleType: CronScheduleType;
  intervalMinutes: number | null;
  cronExpression: string | null;
  ttlDays: number | null;
  delayMinSeconds: number | null;
  delayMaxSeconds: number | null;
  maxSteps: number | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateCronConfigPayload = {
  enabled?: boolean;
  intervalMinutes?: number;
  cronExpression?: string;
  ttlDays?: number;
  delayMinSeconds?: number;
  delayMaxSeconds?: number;
  maxSteps?: number;
};

// ============================================
// ============================================
// SYSTEM CONFIG
// ============================================

export type SystemConfigEntry = {
  id: string;
  configKey: string;
  configValue: string | null;
  category: string;
  label: string | null;
  description: string | null;
  isSecret: boolean;
  isReadonly: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SystemConfigCatalogueEntry = {
  key: string;
  label: string;
  category: string;
  description?: string;
  isSecret?: boolean;
  isReadonly?: boolean;
};

export type WebhookEntry = {
  provider: string;
  label: string;
  url: string;
  note: string;
};

// ============================================
// CONSTANTES
// ============================================

export const SEUILS_ALERTES = {
  MESSAGES_EN_ATTENTE_WARNING: 10,
  MESSAGES_EN_ATTENTE_CRITICAL: 50,
  CHATS_NON_LUS_WARNING: 5,
  CHATS_NON_LUS_CRITICAL: 20,
  TAUX_REPONSE_MIN: 60,
  TAUX_ASSIGNATION_MIN: 70,
  TEMPS_REPONSE_MAX_MINUTES: 15,
} as const;

export const COULEURS_STATUT = {
  actif: 'green',
  'en attente': 'yellow',
  'fermé': 'gray',
  online: 'green',
  offline: 'gray',
} as const;
