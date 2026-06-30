// ============================================
// TYPES STATUTS / DIRECTIONS (entity-level)
// ============================================

export type StatutChat = 'actif' | 'en attente' | 'fermé';
export type DirectionMessage = 'IN' | 'OUT';
export type TypeMessage = 'text' | 'image' | 'audio' | 'video' | 'document';
export type StatutMessage = 'failed' | 'pending' | 'sent' | 'delivered' | 'read' | 'played' | 'deleted';
export type ModeAssignation = 'ONLINE' | 'OFFLINE';

// ============================================
// ENTITÉS CORE
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

export type Poste = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  is_queue_enabled?: boolean;
  media_panel_enabled?: boolean;
  media_panel_types?: string | null;
  bypassRestrictions?: boolean;
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
  bypassRestrictions?: boolean;
  phone_number?: string | null;
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

// ============================================
// AUTO MESSAGES
// ============================================

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

// ============================================
// SOUS-GROUPES & PAUSES DÉCALÉES
// ============================================

export type SubGroupBreakSchedule = {
  id: string;
  subGroupId: string;
  startTime: string;
  endTime: string;
  reminderIntervalMinutes: number;
  popupMessageText: string | null;
  popupAudioUrl: string | null;
  maxDurationMinutes: number;
};

export type CommercialPresenceItem = {
  id: string;
  name: string;
  isConnected: boolean;
  isWorkingToday: boolean;
  workingTodaySince: string | null;
  poste: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  groupId?: string | null;
  phone?: string | null;
};

export type CommercialSubGroup = {
  id: string;
  parentGroupId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  breakSchedules: SubGroupBreakSchedule[];
  memberCount: number;
  members?: { id: string; name: string; phone?: string | null }[];
};

export type BreakExclusion = {
  id: string;
  subGroupId: string;
  scope: 'poste' | 'commercial';
  posteId: string | null;
  commercialId: string | null;
};

export type BreakSupervisionRow = {
  commercialId: string;
  commercialName: string;
  subGroupId: string | null;
  subGroupName: string | null;
  scheduledBreak: { startTime: string; endTime: string } | null;
  hasTakenBreak: boolean;
  breakTakenAt: string | null;
  disconnectDurationMinutes: number | null;
  status: 'en_service' | 'en_pause' | 'pause_manquee' | 'deconnecte' | 'repos' | 'absent';
};

export type DisconnectAlert = {
  commercialId: string;
  commercialName: string;
  disconnectedSince: string;
  totalDisconnectMinutes: number;
};

// ─── CommercialGroup ──────────────────────────────────────────────────────────

export type TimeSlot = 'morning' | 'afternoon' | 'full_day' | 'full';

export type GroupScheduleDayItem = {
  date: string;
  isWorkDay: boolean;
  dayOfWeek: number;
};

export type CalendarHealthItem = {
  groupId: string;
  groupName: string;
  lastGeneratedDate: string | null;
  coverageUntil: string | null;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  lastDay?: string | null;
};

export type ScheduleConfigDto = {
  workDays?: number[];
  workDaysCount?: number;
  cycleOnDays?: number;
  cycleOffDays?: number;
  firstWorkDay: string;
  timezone?: string;
};

export type GenerateScheduleResult = {
  daysGenerated: number;
};

export type GenerateAllResult = {
  groupId: string;
  groupName: string;
  daysGenerated: number;
};

export type CommercialPlanningEntry = {
  id: string;
  commercialId: string;
  commercialName: string;
  date: string;
  type: 'absence' | 'exceptional';
  reason: string | null;
  timeSlot: TimeSlot | null;
  replacerId: string | null;
  replacerName: string | null;
  commercial?: { id: string; name: string } | null;
  linkedCommercialId: string | null;
  linkedCommercial: { id: string; name: string } | null;
  overridePosteId: string | null;
  overridePoste: { id: string; name: string; code?: string } | null;
  createdAt: string;
};

export type AbsenceSummaryItem = {
  commercialId: string;
  commercialName: string;
  absenceCount: number;
  exceptionalCount: number;
  totalDays: number;
  groupName?: string | null;
};

export type PlanningAuditEntry = {
  id: string;
  commercialId: string;
  commercialName: string;
  date: string;
  type: 'absence' | 'exceptional';
  reason: string | null;
  createdAt: string;
  deletedAt: string | null;
  action: 'created' | 'deleted';
  actorName?: string | null;
  declaredBy?: string | null;
  performedAt: string;
};

export type CommercialGroup = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  cycleOnDays: number | null;
  cycleOffDays: number | null;
  firstWorkDay: string | null;
  workDays: number[] | null;
  workDaysCount?: number;
  timezone: string | null;
  commercials?: CommercialPresenceItem[];
  subGroups?: CommercialSubGroup[];
  createdAt: string;
  updatedAt: string;
};

// ============================================
// PRESENCE HISTORY
// ============================================

export type PresenceEntry = {
  commercialId: string;
  commercialName: string;
  groupId: string | null;
  groupName: string | null;
  firstLoginAt: string | null;
  lastLogoutAt: string | null;
  sessionCount: number;
  totalConnectedMinutes: number;
  planningStatus: 'normal' | 'absent' | 'exceptional' | null;
  groupIsWorkDay: boolean | null;
  isWorkingToday: boolean;
};

export type PresenceHistoryResponse = {
  date: string;
  entries: PresenceEntry[];
};

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
  requirePass: boolean;
  historyVisible: boolean;
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

// ============================================
// SESSIONS DE CONNEXION
// ============================================

export type SessionStatus = 'active' | 'closed';

export interface SessionRow {
  id: string;
  commercialId: string;
  commercialName: string;
  loginAt: string;
  logoutAt: string | null;
  durationMinutes: number;
  status: SessionStatus;
}

export interface SessionsKpis {
  activeSessions: number;
  avgDurationMinutes: number;
  totalConnectedMinutes: number;
}

export interface SessionsResponse {
  sessions: SessionRow[];
  total: number;
  page: number;
  kpis: SessionsKpis;
}

// ============================================
// HISTORIQUE DÉCONNEXIONS
// ============================================

export interface DisconnectHistoryEntry {
  logId: string;
  commercialId: string;
  commercialName: string;
  loginAt: string;
  logoutAt: string | null;
  alertedAt: string;
  durationMinutes: number;
  disconnectReason: string | null;
}

export interface DisconnectHistoryResponse {
  entries: DisconnectHistoryEntry[];
  total: number;
  page: number;
}

export interface DisconnectCommercialResponse {
  disconnected: boolean;
  message: string;
}

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
