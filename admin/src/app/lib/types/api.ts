import type { Poste, StatutChat } from './entities';

// ============================================
// STATS GLOBALES / PERFORMANCE
// ============================================

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

// ============================================
// DISPATCH / QUEUE
// ============================================

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

export type DispatchSettingsAudit = {
  id: string;
  settings_id: string;
  payload: string;
  createdAt: string;
};

// ============================================
// MÉTRIQUES OVERVIEW
// ============================================

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
  bypassRestrictions?: boolean;
  poste_name: string;
  poste_id: string | null;
  nbChatsActifs: number;
  nbMessagesEnvoyes: number;
  nbMessagesRecus: number;
  tauxReponse: number;
  tempsReponseMoyen: number;
  lastConnectionAt: string | null;
  totalConnectionMinutes?: number;
  nbMessagesLusSansReponse: number;
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
  windowReminderMinReplies:        number | null;
  windowReminderMaxAttempts:       number | null;
  windowReminderAttemptIntervalMin: number | null;
  ttlDaysCtwa:                     number | null;
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
  windowReminderMinReplies?:        number;
  windowReminderMaxAttempts?:       number;
  windowReminderAttemptIntervalMin?: number;
  ttlDaysCtwa?:                     number;
};

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
// TRAFIC MESSAGES
// ============================================

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
// CHATS LUS SANS RÉPONSE
// ============================================

export type ChatLuSansReponse = {
  id: string;
  chat_id: string;
  name: string;
  contact_client: string;
  status: string;
  last_activity_at: string | null;
  last_client_message_at: string | null;
  last_read_at: string | null;
  last_poste_message_at: string | null;
  last_opened_at: string | null;
  last_closed_at: string | null;
  last_relaunched_at: string | null;
  session_count: number;
};

export type ChatReadStatus = {
  lastReadAt: string | null;
  lastReadByName: string | null;
  hasUnrespondedRead: boolean;
};

// ============================================
// ANALYTICS DÉTAILLÉS — /admin/analytics/
// ============================================

export interface AnalyticsSummary {
  totalConversations: number;
  openConversations: number;
  closedConversations: number;
  avgFirstResponseTimeSeconds: number;
  avgResolutionTimeSeconds: number;
  totalMessages: number;
  messagesIn: number;
  messagesOut: number;
}

export interface AnalyticsConversationDay {
  date: string;
  total: number;
  opened: number;
  closed: number;
  avgResolutionSeconds: number;
}

export interface AnalyticsAgent {
  agentId: string;
  agentName: string;
  posteName: string;
  messagesOut: number;
  chatsHandled: number;
  avgResponseSeconds: number;
}

export interface AnalyticsChannel {
  channelId: string;
  label: string | null;
  provider: string;
  totalMessages: number;
  messagesIn: number;
  messagesOut: number;
  totalConversations: number;
}

// ============================================
// COACHING QUALITÉ IA
// ============================================

export interface QualityCoachingResult {
  quality_score: number;
  strengths: string[];
  improvements: string[];
  coaching_tips: string[];
}

export interface ConversationSummaryItem {
  id: string;
  chat_id: string;
  name: string;
  last_activity_at: string;
  status?: string;
}
