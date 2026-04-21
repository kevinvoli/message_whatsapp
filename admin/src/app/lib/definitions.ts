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
  | 'ia-governance';

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
};


export type ClientCategory = 'jamais_commande' | 'commande_sans_livraison' | 'commande_avec_livraison' | 'commande_annulee';
export type CertificationStatus = 'non_verifie' | 'en_attente' | 'certifie' | 'rejete';

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
  certification_status?: CertificationStatus | null;
  certified_at?: string | null;
  order_client_id?: number | null;
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
  portfolio_count?: number;
  follow_ups_pending?: number;
  follow_ups_overdue?: number;
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
// PHASE 4 — Templates HSM
// ============================================

export type TemplateStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'IN_APPEAL' | 'FLAGGED' | 'DELETED';
export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export interface WhatsappTemplate {
  id: string;
  tenant_id: string;
  channel_id: string;
  name: string;
  meta_template_id: string | null;
  category: TemplateCategory;
  language: string;
  status: TemplateStatus;
  header_type: string | null;
  header_content: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: Record<string, unknown>[] | null;
  rejection_reason: string | null;
  createdAt: string;
  updatedAt: string;
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
