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

export type ViewMode = 'overview' | 'commerciaux' | 'performance' | 'analytics' | 'messages' | 'clients' | 'rapports' | 'postes' | 'canaux' | 'automessages' | 'conversations'; // Added 'conversations'

import React from 'react'; // Import React for React.ElementType

export type NavigationItem = {
    id: ViewMode;
    name: string;
    icon: React.ElementType; // Use React.ElementType for the icon component type
    badge: string | null;
};

export type StatsGlobales = {
    commerciaux: number;
    canaux: number;
    conversations: number;
    commerciauxActifs: number;
    // Les métriques suivantes nécessiteraient des entités ou des logiques métier supplémentaires
    // pour des calculs précis, et sont donc omises pour éviter des données statiques trompeuses.
    // totalConversions: number;
    // totalCA: number;
    // totalMessages: number;
    // totalConversationsActives: number;
    // tauxConversionMoyen: number;
    // satisfactionMoyenne: string;
    // objectifGlobal: number;
    // caObjectifGlobal: number;
    // totalRDV: number;
    // totalRDVHonores: number;
    // totalDevis: number;
    // totalDevisAcceptes: number;
    // totalAppelsSortants: number;
    // totalAppelsRecus: number;
    // totalNouveauxContacts: number;
    // panierMoyen: number;
    // tauxFidelisationMoyen: number;
    // productiviteMoyenne: number;
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
  chats?:WhatsappChat[];
  messages?:WhatsappMessage[];
  commercial?:Commercial[];
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
  // conditions?: any | null; // This will be JSON parsed
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
  direction: 'IN' | 'OUT'; // IN for messages received, OUT for messages sent
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  timestamp: string; // ISO date string
  mediaUrl?: string;
  mediaType?: string;
  caption?: string;
  is_deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WhatsappChat = {
  id: string; // Internal UUID
  chat_id: string; // External WhatsApp chat ID
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
  contact_client: string; // The phone number or identifier of the contact
  last_activity_at: string; // ISO date string
  createdAt: string;
  updatedAt: string;
  poste: Poste; // Relation to Poste
  messages: WhatsappMessage[]; // Relation to Messages
};