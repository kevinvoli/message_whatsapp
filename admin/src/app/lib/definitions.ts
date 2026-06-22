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

// ─── Application Meta ────────────────────────────────────────────────────────

export interface MessagingApplication {
  id: string;
  label: string;
  provider: string;
  appId: string;
  channelCount?: number;
  createdAt: string;
  updatedAt: string;
}

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
  | 'conversations'
  | 'queue'
  // Phase 5-6
  | 'crm'
  | 'sla-rules'
  | 'audit-logs'
  | 'roles'
  | 'outbound-webhooks'
  | 'broadcasts'
  | 'templates'
  | 'dispatch'
  | 'crons'
  | 'observabilite'
  | 'go_no_go'
  | 'notifications'
  | 'alert-config'
  | 'settings'
  | 'flowbot'
  | 'contexts'
  // Phase 1 — CRM commercial
  | 'follow-ups'
  | 'portfolio'
  // Phase 2 — Ranking, Objectifs, Sessions, IP
  | 'targets'
  | 'ip-access'
  | 'sessions'
  // Phase 3 — Capacité conversationnelle
  | 'capacity'
  // Phase 4 — Dashboard technique
  | 'system-health'
  // Phase Intégration ERP
  | 'integration'
  // Ranking (4.7)
  | 'ranking'
  // IA Gouvernance (CDC IA)
  | 'ia-governance'
  // GICOP — Supervision fermetures + rapports
  | 'gicop-supervision'
  // E02 — Synchronisation DB2 outbox
  | 'outbox-sync'
  // E07 — Plannings de travail
  | 'work-schedule'
  // E08 — Plaintes clients
  | 'complaints'
  // E10-T04 — Journal des connexions
  | 'login-logs'
  // Sprint 3 — Config relances auto
  | 'relance-config'
  // Device-Poste mapping
  | 'call-devices'
  | 'presence'
  | 'commercial-groups'
  // Menu Appels unifié (en absence + GICOP)
  | 'appels'
  // Appels en absence (rétro-compatibilité)
  | 'missed-calls'
  // Applications Meta
  | 'applications'
  // Sprint 2 — vues portées
  | 'message-traffic'
  | 'campaign-links'
  | 'mediatheque'
  | 'channel-stats'
  | 'canaux-dedies'
  | 'lecture-seule'
  | 'campagnes-meta'
  | 'galerie-media'
  | 'quiz'
  // GDPR
  | 'gdpr-optout';

// ─── Context types ────────────────────────────────────────────────────────────

export type ContextType = 'CHANNEL' | 'POSTE' | 'PROVIDER' | 'POOL';

export interface Context {
  id: string;
  tenantId?: string | null;
  label?: string | null;
  contextType: ContextType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  bindings?: ContextBinding[];
}

export interface ContextBinding {
  id: string;
  contextId: string;
  bindingType: ContextType;
  refValue: string;
  createdAt: string;
}

export interface ChatContext {
  id: string;
  chatId: string;
  contextId: string;
  posteId?: string | null;
  unreadCount: number;
  readOnly: boolean;
  lastClientMessageAt: string | null;
  lastPosteMessageAt: string | null;
  lastActivityAt: string | null;
  whatsappChatId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatContextsPage {
  items: ChatContext[];
  nextCursor: string | null;
}

// ─── FlowBot types ────────────────────────────────────────────────────────────

export type FlowNodeType =
  | 'MESSAGE' | 'QUESTION' | 'CONDITION' | 'ACTION' | 'WAIT' | 'ESCALATE' | 'END' | 'AB_TEST'
  // P6.2
  | 'DELAY' | 'HTTP_REQUEST' | 'SEND_TEMPLATE' | 'ASSIGN_LABEL'
  // P6.4
  | 'AI_REPLY';
export type FlowTriggerType =
  | 'INBOUND_MESSAGE' | 'CONVERSATION_OPEN' | 'CONVERSATION_REOPEN'
  | 'OUT_OF_HOURS' | 'ON_ASSIGN' | 'QUEUE_WAIT' | 'NO_RESPONSE'
  | 'INACTIVITY' | 'KEYWORD' | 'SCHEDULE'
  // P6.2
  | 'LABEL_ADDED' | 'SLA_BREACH';

export interface FlowBot {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  priority: number;
  scopeChannelType?: string;
  scopeProviderRef?: string;
  scopeContextId?: string | null;
  triggers?: FlowTrigger[];
  nodes?: FlowNode[];
  edges?: FlowEdge[];
}

export interface FlowTrigger {
  id: string;
  flowId: string;
  triggerType: FlowTriggerType;
  config: Record<string, unknown>;
  isActive: boolean;
}

export interface FlowNode {
  id: string;
  flowId: string;
  type: FlowNodeType;
  label: string;
  positionX: number;
  positionY: number;
  config: Record<string, unknown>;
  timeoutSeconds?: number;
  isEntryPoint: boolean;
}

export interface FlowEdge {
  id: string;
  flowId: string;
  sourceNodeId: string;
  targetNodeId: string;
  conditionType: string;
  conditionValue?: string;
  conditionNegate: boolean;
  sortOrder: number;
}

export interface FlowAnalyticsRow {
  id: string;
  flowId: string;
  periodDate: string;
  sessionsStarted: number;
  sessionsCompleted: number;
  sessionsEscalated: number;
  sessionsExpired: number;
  avgSteps?: number;
  avgDurationSeconds?: number;
}

export type FlowSessionStatus =
  | 'active' | 'waiting_reply' | 'waiting_delay'
  | 'completed' | 'escalated' | 'expired' | 'cancelled';

export interface FlowSession {
  id: string;
  conversationId: string;
  flowId: string;
  currentNodeId: string | null;
  status: FlowSessionStatus;
  variables: Record<string, unknown>;
  stepsCount: number;
  triggerType: string | null;
  startedAt: string;
  lastActivityAt: string | null;
  completedAt: string | null;
  escalatedAt: string | null;
}

export interface FlowSessionLog {
  id: string;
  sessionId: string;
  nodeId: string | null;
  nodeType: string | null;
  edgeTakenId: string | null;
  action: string | null;
  result: string | null;
  metadata: Record<string, unknown> | null;
  executedAt: string;
}

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

export interface CommercialPresenceItem {
  id: string;
  name: string;
  phone: string | null;
  isWorkingToday: boolean;
  workingTodaySince: string | null;
  groupId: string | null;
  poste: { id: string; name: string; code: string } | null;
}

export interface CommercialGroup {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  workDaysCount?: number;
  firstWorkDay?: string | null;
  createdAt: string;
  updatedAt: string;
  commercials?: CommercialPresenceItem[];
}

export interface GroupScheduleDayItem {
  date: string;       // 'YYYY-MM-DD'
  isWorkDay: boolean;
  dayOfWeek: number;  // 0=dim, 1=lun, 2=mar, 3=mer, 4=jeu, 5=ven, 6=sam
}

export interface ScheduleConfigDto {
  workDaysCount: number;
  firstWorkDay: string; // 'YYYY-MM-DD'
}

export interface GenerateScheduleResult {
  daysGenerated: number;
}

export interface GenerateAllResult {
  groupId: string;
  daysGenerated: number;
}

export interface CalendarHealthItem {
  groupId: string;
  groupName: string;
  lastDay: string | null;
}

export type Poste = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  is_queue_enabled?: boolean;
  /** Identifiant numérique sur la plateforme GICOP (nullable) */
  numero_poste?: number | null;
  ipRestrictionExempt?: boolean;
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
  waba_id?: string | null;
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
  max_messages_before_readonly?: number | null;
  application_id?: string | null;
  application?: MessagingApplication | null;
  phone_number?: string | null;
};


export type ClientCategory = 'jamais_commande' | 'commande_sans_livraison' | 'commande_avec_livraison' | 'commande_annulee';

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
  // Champs ERP
  client_category?: ClientCategory | null;
  order_client_id?: number | null;
  contact_source?: 'whatsapp' | 'erp_import' | null;
  referral_code?: string | null;
  referral_count?: number | null;
  referral_commission?: number | null;
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
  /** Conversations sans poste_id — ont besoin d'être dispatché */
  orphan_count: number;
  /** Conversations avec poste_id en attente de reconnexion de l'agent */
  waiting_on_poste_count: number;
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
  no_reply_reinject_interval_minutes: number;
  read_only_check_interval_minutes: number;
  offline_reinject_cron: string;
  dispatch_mode: 'LEAST_LOADED' | 'ROUND_ROBIN';
  readOnlyMaxMessages?: number | null;
  idleDisconnectEnabled?: boolean | null;
  idleDisconnectMinutes?: number | null;
  idleWarningSeco?: number | null;
  idleWarningSeconds?: number | null;
  readCooldownSeconds?: number | null;
  maxReadMessagesPerMinute?: number | null;
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
  totalConversations: number;
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
  phone?: string | null;
  isConnected: boolean;
  poste_name: string;
  poste_id: string | null;
  nbChatsActifs: number;
  nbMessagesEnvoyes: number;
  nbMessagesRecus: number;
  tauxReponse: number;
  tempsReponseMoyen: number;
  lastConnectionAt: string | null;
  portfolio_count?: number;
  follow_ups_pending?: number;
  follow_ups_overdue?: number;
  ipRestrictionExempt?: boolean;
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

// ============================================
// PHASE 5 — CRM Custom Fields
// ============================================

export type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect';

export interface ContactFieldDefinition {
  id: string;
  tenant_id: string;
  name: string;
  field_key: string;
  field_type: FieldType;
  options: string[] | null;
  required: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContactFieldValue {
  id: string;
  contact_id: string;
  field_id: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_boolean: number | null;
  value_json: string[] | null;
}

export interface ContactCrmField {
  definition: ContactFieldDefinition;
  value: ContactFieldValue | null;
}

// ============================================
// PHASE 5 — SLA Rules
// ============================================

export type SlaMetric = 'first_response' | 'resolution' | 'reengagement';
export type SlaSeverity = 'warning' | 'breach';

export interface SlaRule {
  id: string;
  tenant_id: string;
  name: string;
  metric: SlaMetric;
  threshold_seconds: number;
  severity: SlaSeverity;
  notify_admin: boolean;
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SlaViolation {
  rule: SlaRule;
  chatId: string;
  currentValueSeconds: number;
  breached: boolean;
}

// ============================================
// PHASE 5 — Audit Log
// ============================================

export type AuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT'
  | 'SEND_MESSAGE' | 'ASSIGN' | 'TRANSFER' | 'CLOSE' | 'REOPEN' | 'EXPORT';

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_type: string | null;
  action: AuditAction;
  entity_type: string | null;
  entity_id: string | null;
  diff: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogPage {
  items: AuditLog[];
  total: number;
}

// ============================================
// PHASE 5 — RBAC Roles
// ============================================

export type Permission =
  | 'chat:view' | 'chat:reply' | 'chat:close' | 'chat:transfer' | 'chat:merge'
  | 'contact:view' | 'contact:edit' | 'contact:delete' | 'contact:export'
  | 'crm:view' | 'crm:edit'
  | 'label:view' | 'label:manage'
  | 'analytics:view' | 'analytics:export'
  | 'canned:view' | 'canned:manage'
  | 'admin:panel' | 'user:manage' | 'channel:manage';

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  is_system: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// PHASE 4 — Templates HSM (ancien modèle Whapi)
// ============================================

export type WhatsappTemplateStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type WhatsappTemplate = {
  id: string;
  channelId: string;
  name: string;
  language: string;
  category?: string | null;
  status: WhatsappTemplateStatus;
  components?: unknown | null;
  externalId?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

// ============================================
// SPRINT 1 — Templates HSM Meta (nouveau modèle admin /admin/templates)
// ============================================

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type TemplateStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'IN_APPEAL' | 'FLAGGED' | 'DELETED';
export type TemplateHeaderType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';

export interface HsmTemplate {
  id: string;
  tenant_id: string;
  channel_id: string | null;
  name: string;
  category: TemplateCategory;
  language: string;
  status: TemplateStatus;
  rejected_reason: string | null;
  meta_template_id: string | null;
  base_model: string | null;
  header_type: TemplateHeaderType | null;
  header_text: string | null;
  header_example: string | null;
  header_content: string | null;
  body_text: string;
  body_example_variables: string[] | null;
  footer_text: string | null;
  parameters: Record<string, unknown>[] | null;
  buttons: Record<string, unknown>[] | null;
  submitted_at: string | null;
  submission_error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateBaseModel {
  key: string;
  label: string;
  category: TemplateCategory;
  components: string[];
}

// ============================================
// PHASE 4 — Broadcasts
// ============================================

export type BroadcastStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

export interface Broadcast {
  id: string;
  tenant_id: string;
  name: string;
  status: BroadcastStatus;
  template_id: string | null;
  scheduled_at: string | null;
  /** total_count dans l'entité backend */
  total_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// PHASE 6 — Outbound Webhooks
// ============================================

export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed' | 'retrying';

export interface OutboundWebhook {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  events: string[];
  max_retries: number;
  retry_delay_seconds: number;
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OutboundWebhookLog {
  id: string;
  webhook_id: string;
  event: string;
  status: WebhookDeliveryStatus;
  response_status: number | null;
  error: string | null;
  attempt: number;
  createdAt: string;
}

// ============================================
// PHASE 1 — CRM Commercial
// ============================================

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

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  planifiee:  'Planifiée',
  en_retard:  'En retard',
  effectuee:  'Effectuée',
  annulee:    'Annulée',
};

export const FOLLOW_UP_STATUS_COLORS: Record<FollowUpStatus, string> = {
  planifiee:  'bg-blue-100 text-blue-700',
  en_retard:  'bg-red-100 text-red-700',
  effectuee:  'bg-green-100 text-green-700',
  annulee:    'bg-gray-100 text-gray-500',
};

export interface FollowUp {
  id: string;
  contact_id?: string | null;
  conversation_id?: string | null;
  commercial_id?: string | null;
  commercial_name?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  type: FollowUpType;
  status: FollowUpStatus;
  scheduled_at: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  result?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientSummary {
  id: string;
  chat_id?: string | null;
  name: string;
  phone: string;
  source?: string | null;
  contact_source?: 'whatsapp' | 'erp_import' | null;
  client_category?: string | null;
  portfolio_owner_id?: string | null;
  portfolio_owner_name?: string | null;
  call_status?: string | null;
  last_call_date?: string | null;
  total_messages?: number;
  call_count?: number;
  conversation_count?: number;
  next_follow_up?: string | null;
  is_active: boolean;
  createdAt: string;
}

export interface OutcomeStats {
  result: ConversationResult;
  count: number;
}

export interface TimelineEvent {
  id: string;
  type: 'message' | 'follow_up' | 'conversation_result' | 'note';
  direction?: 'IN' | 'OUT';
  text?: string | null;
  timestamp: string;
  actor_name?: string | null;
  meta?: Record<string, unknown>;
}

export interface ClientDossier {
  client: ClientSummary;
  crm_fields?: Array<{ key: string; label: string; value: string | null }>;
  recent_conversations?: Array<{
    id: string;
    chat_id: string;
    status: string;
    result?: ConversationResult | null;
    last_activity_at: string;
  }>;
  follow_ups?: FollowUp[];
  timeline?: TimelineEvent[];
}

// ============================================
// OUTBOUND — Initier une conversation sortante
// ============================================

export interface OutboundConversationDto {
  channel_id: string;
  recipient: string;
  text: string;
}

export interface OutboundConversationResult {
  success: boolean;
  chatId: string;
  messageId: string;
  contactId: string;
}

// ============================================
// SPRINT 3 — Config relances auto
// ============================================

export interface FollowUpTemplateMappingDto {
  follow_up_type: string;
  template_id: string;
  template_name: string;
  language_code: string;
}

// ============================================
// PLANNING — Gestion des imprévus
// ============================================

export type TimeSlot = 'full' | 'morning' | 'afternoon';

export interface CommercialPlanningEntry {
  id: string;
  commercialId: string;
  commercial: { id: string; name: string; phone?: string };
  type: 'absence' | 'exceptional';
  timeSlot: TimeSlot;
  date: string;
  linkedCommercialId?: string | null;
  linkedCommercial?: { id: string; name: string } | null;
  overridePosteId?: string | null;
  overridePoste?: { id: string; name: string; code: string } | null;
  reason?: string | null;
  declaredBy?: string | null;
  createdAt: string;
}

export interface PlanningAuditEntry {
  id: string;
  planningId: string | null;
  action: 'created' | 'deleted';
  commercialId: string;
  type: 'absence' | 'exceptional';
  date: string;
  reason: string | null;
  declaredBy: string | null;
  performedAt: string;
}

export interface AbsenceSummaryItem {
  commercialId: string;
  commercialName: string;
  groupName: string | null;
  totalDays: number;
}

// ============================================
// STATS COMMERCIAUX (détail activité)
// ============================================

export type CommercialStatsDto = {
  commercialId: string;
  messagesRead: number;
  messagesHandled: number;
  activeConversations: number;
  responseRate: number;
  lastActivityAt: string | null;
  isOnline: boolean;
  conversationsReceived: number;
  conversationsReplied: number;
  conversationsHandled: number;
  totalConnectionMinutes?: number;
};

// ============================================
// STATS CANAUX DÉTAILLÉES
// ============================================

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

// ============================================
// MEDIA ASSET (Médiathèque)
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

// ============================================
// TRAFIC MESSAGES
// ============================================

export type TraficPoint = {
  index:         number;
  label:         string;
  total:         number;
  messages_in:   number;
  messages_out:  number;
  avg_par_unite: number;
};

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
// CAMPAGNES META (CTWA)
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
  totalSize: number;
};

export type GalerieFilterOptions = {
  channels: { id: string; label: string | null; phone_number: string | null }[];
  postes: { id: string; name: string; code: string }[];
};

// ============================================
// RESTRICTION CONTENU MESSAGES COMMERCIAUX
// ============================================

export interface MessageRestrictionConfig {
  enabled: boolean;
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
// QCM FORMATION
// ============================================

export type QuizCategory = {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
};

export type QuizAnswer = {
  id: string;
  text: string;
  isCorrect: boolean;
  position: number;
};

export type QuizQuestion = {
  id: string;
  categoryId: string;
  category?: QuizCategory;
  text: string;
  points: number;
  timeLimitSeconds: number | null;
  isActive: boolean;
  answers: QuizAnswer[];
  createdAt: string;
};

export type QuizSession = {
  id: string;
  title: string;
  sessionDate: string;
  isActive: boolean;
  passingScore: number | null;
  maxAttempts: number;
  totalTimeMinutes: number | null;
  questionCount?: number;
  createdAt: string;
};

export type QuizExemption = {
  id: string;
  scope: 'commercial' | 'poste';
  commercialId: string | null;
  posteId: string | null;
  reason: string | null;
  commercial?: { id: string; name: string };
  poste?: { id: string; name: string };
  createdAt: string;
};

export interface QuizSessionResult {
  commercialId: string;
  commercialName: string;
  posteName: string;
  attemptsCount: number;
  bestScore: number | null;
  maxScore: number | null;
  isPassed: boolean | null;
  completedAt: string | null;
}

export interface QuizPdf {
  id: string;
  sessionId: string | null;
  originalName: string;
  fileSize: number;
  allowInlineView: boolean;
  isPermanent: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  uploadedAt: string;
}

export interface DisconnectCommercialResponse {
  disconnected: boolean;
  message: string;
}

export interface PostePanelConfig {
  enabled: boolean;
  types: string[];
}

// ============================================
// GDPR OPT-OUT
// ============================================

export type GdprOptoutStatus = 'active' | 'revoked';

export interface GdprOptout {
  id: string;
  phone: string;
  optOutAt: string;
  revokedAt: string | null;
  status: GdprOptoutStatus;
  createdAt: string;
  updatedAt: string;
}

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
