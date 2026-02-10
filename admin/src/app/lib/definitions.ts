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

export type ViewMode = 'overview' | 'commerciaux' | 'performance' | 'analytics' | 'messages' | 'clients' | 'rapports' | 'postes' | 'canaux' | 'automessages' | 'conversations';

export type NavigationItem = {
  id: ViewMode;
  name: string;
  icon: React.ElementType;
  badge: string | null;
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
  created_at: string;
  updated_at: string;
  chats?: WhatsappChat[];
  messages?: WhatsappMessage[];
  commercial?: Commercial[];
};

export type Channel = {
  id: string;
  channel_id: string;
  token: string;
  start_at: number;
  uptime: number;
  version: string;
  device_id: number;
  ip: string;
  is_business: boolean;
  api_version: string;
  core_version: string;
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
  created_at: string;
  updated_at: string;
};

export type Client = {
  id: string;
  name: string;
  phone: string;
  chat_id?: string;
  is_active: boolean;
  messages?: WhatsappMessage[];
  createdAt: string;
  updatedAt: string;
};

export type WhatsappMessage = {
  id: string;
  chat_id: string;
  text: string;
  direction: 'IN' | 'OUT';
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  timestamp: string;
  mediaUrl?: string;
  mediaType?: string;
  caption?: string;
  is_deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WhatsappChat = {
  id: string;
  chat_id: string;
  name: string;
  type: string;
  chat_pic: string;
  chat_pic_full: string;
  is_pinned: boolean;
  is_muted: boolean;
  mute_until: string | null;
  is_archived: boolean;
  unread_count: number;
  unread_mention: boolean;
  read_only: boolean;
  not_spam: boolean;
  contact_client: string;
  last_activity_at: string;
  createdAt: string;
  updatedAt: string;
  poste: Poste;
  messages: WhatsappMessage[];
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