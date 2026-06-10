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
  | 'message-traffic'
  | 'clients'
  | 'rapports'
  | 'postes'
  | 'canaux'
  | 'templates'
  | 'automessages'
  | 'conversations'
  | 'queue'
  | 'dispatch'
  | 'lecture-seule'
  | 'crons'
  | 'observabilite'
  | 'go_no_go'
  | 'notifications'
  | 'alert-config'
  | 'campaign-links'
  | 'mediatheque'
  | 'settings'
  | 'channel-stats'
  | 'canaux-dedies'
  | 'campagnes-meta'
  | 'galerie-media';

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

export type PostePanelConfig = {
  enabled: boolean;
  types: string[];
};

export type Poste = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  is_queue_enabled?: boolean;
  media_panel_enabled?: boolean;
  media_panel_types?: string | null;
  createdAt?: string;
  updatedAt?: string;
  chats?: WhatsappChat[] | null;
  messages?: WhatsappMessage[] | null;
  commercial?: Commercial[] | null;
  channels?: Channel[] | null;
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
  createdAt: string;
  updatedAt: string;
  poste_id?: string | null;
  poste?: Poste | null;
  no_read_only?: boolean;
  no_close?: boolean;
  readOnlyAfterMessages?: number | null;
  phone_number?: string | null;
};

// ============================================
// TEMPLATES HSM WHATSAPP
// ============================================

export type WhatsappTemplateStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type WhatsappTemplate = {
  id: string;
  channelId: string;
  name: string;
  language: string;
  category?: string | null;
  status: WhatsappTemplateStatus;
  /** Structure JSON des composants (header, body, footer, buttons) */
  components?: any | null;
  externalId?: string | null;
  /** Motif de rejet fourni par Meta (null si non rejecte) */
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AutoMessageTriggerType =
  | 'no_response'
  | 'sequence'
  | 'out_of_hours'
  | 'reopened'
  | 'queue_wait'
  | 'keyword'
  | 'client_type'
  | 'inactivity'
  | 'on_assign'
  | 'window_reminder';

export type KeywordMatchType = 'exact' | 'contains' | 'starts_with';

export type AutoMessageKeyword = {
  id: string;
  messageAutoId: string;
  keyword: string;
  matchType: KeywordMatchType;
  caseSensitive: boolean;
  actif: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type BusinessHoursConfig = {
  id: string;
  dayOfWeek: number; // 0=Dim, 1=Lun, ..., 6=Sam
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  isOpen: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type MessageAutoConditions = {
  poste_id?: string;
  channel_id?: string;
  client_type?: string;
  excluded_channel_ids?: string[];
  excluded_poste_ids?: string[];
  [key: string]: unknown;
};

export type MessageAuto = {
  id: string;
  body: string;
  delai?: number | null;
  canal?: 'whatsapp' | 'sms' | 'email' | null;
  position: number;
  actif: boolean;
  trigger_type?: AutoMessageTriggerType | null;
  scope_type?: 'poste' | 'canal' | 'provider' | null;
  scope_id?: string | null;
  scope_label?: string | null;
  client_type_target?: 'all' | 'new' | 'returning' | null;
  windowReminderTarget?: 'with_replies' | 'no_replies' | null;
  conditions?: MessageAutoConditions | null;
  keywords?: AutoMessageKeyword[];
  mediaAssetId?: string | null;
  mediaAsset?: MediaAsset | null;
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
  campaign_link_id?: string | null;
  isCtwa?: boolean;
  metaAdReferral?: {
    headline: string | null;
    imageUrl: string | null;
    sourceId: string;
  } | null;
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
  stuck_active_count: number;
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
  queue_mode: 'least_loaded' | 'round_robin';
  no_reply_reinject_interval_minutes: number;
  read_only_check_interval_minutes: number;
  offline_reinject_cron: string;
  auto_message_enabled: boolean;
  auto_message_delay_min_seconds: number;
  auto_message_delay_max_seconds: number;
  auto_message_max_steps: number;
  readOnlyMaxMessages?: number;
  /** Limite de messages lus par minute par commercial (1–60) */
  maxReadMessagesPerMinute?: number;
  /** Active/désactive la déconnexion automatique pour inactivité */
  idleDisconnectEnabled?: boolean;
  /** Durée d'inactivité en minutes avant déconnexion automatique (1–480) */
  idleDisconnectMinutes?: number;
  /** Durée du cooldown entre deux ouvertures de conv non lues en secondes (30–3600) */
  readCooldownSeconds?: number;
  /** Secondes d'avertissement avant déconnexion automatique (5–60) */
  idleWarningSeconds?: number;
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

  // Métriques Conversations
  totalConversations: number;
  conversationsNouveauxClients: number;
  conversationsAnciensClients: number;
  chatsLusSansReponse: number;
  chatsLusAvecReponse: number;

  // Métriques Performance
  messagesEnAttente: number;
  tauxAssignation: number;
  tempsPremiereReponse: number;
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
 * Statistiques d'activité temps réel d'un commercial (GET /commercials/:id/stats)
 */
export type CommercialStatsDto = {
  commercialId: string;
  messagesRead: number;
  messagesHandled: number;
  activeConversations: number;
  /** Pourcentage avec 1 décimale */
  responseRate: number;
  lastActivityAt: string | null;
  isOnline: boolean;
  /** Conversations dont au moins un message IN a été lu par ce commercial dans la période */
  conversationsReceived: number;
  /** Conversations auxquelles ce commercial a envoyé au moins un message OUT dans la période */
  conversationsReplied:  number;
  /** Conversations dont ce commercial a envoyé le dernier message global */
  conversationsHandled:  number;
  totalConnectionMinutes?: number;
};

/**
 * Performance détaillée d'un commercial
 */
export type PerformanceCommercial = {
  id: string;
  name: string;
  email: string;
  isConnected: boolean;
  allowOutsideHours: boolean;
  poste_name: string;
  poste_id: string | null;
  nbChatsActifs: number;
  nbMessagesEnvoyes: number;
  nbMessagesRecus: number;
  tauxReponse: number;
  tempsReponseMoyen: number;
  lastConnectionAt: string | null;
  totalConnectionMinutes?: number;
};

/**
 * Statut détaillé d'un channel WhatsApp
 */
export type StatutChannel = {
  id: string;
  channel_id: string;
  label?: string | null;
  is_business: boolean;
  uptime: number;
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
  /** tenantId → label du canal, résolu côté serveur */
  channel_labels?: Record<string, string>;
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

export type CronScheduleType = 'interval' | 'cron' | 'event' | 'config';

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
  // Champs avancés messages auto
  noResponseThresholdMinutes: number | null;
  queueWaitThresholdMinutes: number | null;
  inactivityThresholdMinutes: number | null;
  applyToReadOnly: boolean | null;
  applyToClosed: boolean | null;
  activeHourStart: number | null;
  activeHourEnd: number | null;
  windowReminderNormalStartMin: number | null;
  windowReminderNormalEndMin:   number | null;
  windowReminderCtwaStartMin:   number | null;
  windowReminderCtwaEndMin:     number | null;
  windowReminderMinReplies:     number | null;
  ttlDaysCtwa:                  number | null;
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
  noResponseThresholdMinutes?: number;
  queueWaitThresholdMinutes?: number;
  inactivityThresholdMinutes?: number;
  applyToReadOnly?: boolean;
  applyToClosed?: boolean;
  activeHourStart?: number;
  activeHourEnd?: number;
  windowReminderNormalStartMin?: number;
  windowReminderNormalEndMin?:   number;
  windowReminderCtwaStartMin?:   number;
  windowReminderCtwaEndMin?:     number;
  windowReminderMinReplies?:     number;
  ttlDaysCtwa?:                  number;
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


// ============================================
// MEDIA ASSET (Mediathèque)
// ============================================

export type MediaAssetType = 'image' | 'video' | 'audio' | 'document';

export type MediaAsset = {
  id: string;
  name: string;
  originalName: string;
  publicUrl: string;
  filePath: string;
  mimeType: string;
  mediaType: MediaAssetType;
  fileSize: number;
  category: string | null;
  tags: string[] | null;
  colorLabel: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
};

// ============================================
// CAMPAIGN LINKS
// ============================================

export type CampaignLink = {
  id: string;
  name: string;
  channelId: string;
  channel?: { id: string; label?: string | null; channel_id: string; phone_number?: string | null } | null;
  predefinedMessage: string;
  shortCode: string;
  directUrl: string;
  trackedUrl: string;
  clickCount: number;
  conversionCount: number;
  isActive: boolean;
  media_asset_id: string | null;
  media_asset: MediaAsset | null;
  createdAt: string;
  updatedAt: string;
};

export type ChannelLinkStats = {
  id: string;
  name: string;
  shortCode: string;
  isActive: boolean;
  clickCount: number;
  conversionCount: number;
  conversations_count: number;
  messages_in: number;
  messages_out: number;
};

/**
 * Statistiques détaillées d'un canal sur une période
 */
export type ChannelDetailStats = {
  channel_id: string;
  conversations_total: number;
  conversations_actif: number;
  conversations_attente: number;
  conversations_ferme: number;
  messages_total: number;
  messages_in: number;
  messages_out: number;
  links_count: number;
  links_clicks_total: number;
  links_conversions_total: number;
  temporal: { date: string; messages_in: number; messages_out: number; total: number }[];
  links: ChannelLinkStats[];
};

export type CampaignLinkClick = {
  id: string;
  campaignLinkId: string;
  clickedAt: string;
  ipHash: string | null;
  userAgent: string | null;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'other' | null;
  converted: boolean;
  convertedAt: string | null;
  chatId: string | null;
};

export type CampaignLinkStats = {
  total_clicks: number;
  total_conversions: number;
  conversion_rate: number;
  unique_clicks: number;
  clicks_by_day: { date: string; clicks: number; conversions: number }[];
  clicks_by_device: { device_type: string; count: number }[];
};


/** Point générique du diagramme trafic (heure ou jour) */
export type TraficPoint = {
  index:         number;   // 0-23 (heure) ou 0-6 (jour)
  label:         string;   // "00:00" ou "Lun"
  total:         number;
  messages_in:   number;
  messages_out:  number;
  avg_par_unite: number;
};

/** Statistiques calculées sur la période */
export type TraficStatistiques = {
  total: number;
  messages_in: number;
  messages_out: number;
  moy_par_minute: number;
  moy_par_heure: number;
  moy_par_jour: number;
  heure_pic: number;
  messages_pic: number;
  heure_creux: number;
  heure_pic_in: number;
  ratio_in_out: number;
  pourcentage_in: number;
  pourcentage_out: number;
  concentration_matin: number;
  concentration_aprem: number;
  concentration_soir: number;
  concentration_nuit: number;
  heures_actives: number;
  nb_jours: number;
  mode: 'journee' | 'periode';
};

/** Réponse de l'endpoint trafic-horaire v2 */
export type TraficResponse = {
  granularite:  'heure' | 'jour';
  points:       TraficPoint[];
  statistiques: TraficStatistiques;
  meta: {
    periode:    string;
    dateStart:  string;
    dateEnd:    string;
    nb_unites:  number;
    nb_jours:   number;
  };
};

// Alias de compatibilité v1 → v2
export type TraficHoraireResponse = TraficResponse;
export type TraficHorairePoint    = TraficPoint;

export type TraficConversationsPoint = {
  index:         number;
  label:         string;
  total:         number;
  fermees:       number;
  actives:       number;
  avg_par_unite: number;
};

export type TraficConversationsStatistiques = {
  total:             number;
  actives:           number;
  fermees:           number;
  en_attente:        number;
  taux_cloture:      number;
  taux_actives:      number;
  moy_par_heure:     number;
  moy_par_jour:      number;
  unite_pic:         number;
  conversations_pic: number;
  unites_actives:    number;
  nb_jours:          number;
  mode:              'journee' | 'periode';
};

export type TraficConversationsResponse = {
  granularite:  'heure' | 'jour';
  points:       TraficConversationsPoint[];
  statistiques: TraficConversationsStatistiques;
  meta: {
    periode:   string;
    dateStart: string;
    dateEnd:   string;
    nb_unites: number;
    nb_jours:  number;
  };
};


export const COULEURS_STATUT = {
  actif: 'green',
  'en attente': 'yellow',
  'fermé': 'gray',
  online: 'green',
  offline: 'gray',
} as const;

// ============================================
// RESTRICTION CONTENU MESSAGES COMMERCIAUX
// ============================================

export interface MessageRestrictionConfig {
  maxWordLength: number;
  maxRepeatedChars: number;
  minAudioDurationSeconds: number;
}

// ============================================
// RESTRICTION LECTURE CONVERSATIONS
// ============================================

export interface RestrictionConfig {
  enabled: boolean;
  maxUnrespondedConvs: number;
  minResponseChars: number;
  requireLastMessageMine: boolean;
  minCharsSendEnabled: boolean;
}

// ============================================
// CAMPAGNES META (CTWA / Click-to-WhatsApp)
// ============================================

export interface MetaAdKpiRow {
  source_id:             string;
  headline:              string | null;
  image_url:             string | null;
  sample_chat_id:        string;
  total_conversations:   number;
  conversations_closed:  number;
  conversion_rate:       number;
  avg_messages_per_chat: number;
  avg_first_response_s:  number | null;
  first_seen:            string;
  last_seen:             string;
}

// ============================================
// GALERIE MEDIAS SERVEUR
// ============================================

export type StoredMediaType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'voice'
  | 'sticker'
  | 'gif'
  | 'location'
  | 'contact';

export type MediaDirection = 'IN' | 'OUT';

export type StoredMedia = {
  id: string;
  local_url: string;
  media_type: StoredMediaType;
  mime_type: string;
  file_name: string | null;
  file_size: string | null;
  caption: string | null;
  duration_seconds: number | null;
  width: string | null;
  height: string | null;
  downloaded_at: string | null;
  createdAt: string;
  message: {
    direction: MediaDirection;
    from: string;
    from_name: string;
    poste_id: string | null;
    poste: { id: string; name: string; code: string } | null;
  } | null;
  channel: {
    id: string;
    label: string | null;
    phone_number: string | null;
    provider: string | null;
  } | null;
};

export type StoredMediaResponse = {
  items: StoredMedia[];
  total: number;
  pages: number;
};

export type GalerieFilterOptions = {
  channels: { id: string; label: string | null; phone_number: string | null }[];
  postes: { id: string; name: string; code: string }[];
};
