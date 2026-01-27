// whapi-webhook.interface.ts

export type WhapiEventType =
  | 'messages'
  | 'statuses'
  | 'events'
  | 'polls'
  | 'interactive'
  | 'contacts'
  | 'locations'
  | 'live_locations'
  | 'hsm'
  | 'orders'
  | 'products'
  | 'catalogs'
  | 'invites';

export type WhapiMessageType = 'text' | 'image' | 'audio' | 'video' | 'document';

// --- Media types ---

export interface WhapiText { body: string; }

export interface WhapiImage { id: string; mime_type: string; caption?: string; }

export interface WhapiAudio { id: string; mime_type: string; }

export interface WhapiVideo { id: string; mime_type: string; caption?: string; }

export interface WhapiDocument { id: string; filename: string; mime_type: string; }

// --- Messages ---

export interface WhapiMessage {
  id: string;
  from_me: boolean;
  type: WhapiMessageType;
  chat_id: string;
  channel_id:string
  timestamp: number;
  source: string;
  device_id: number;
  chat_name: string;
  from: string;
  from_name: string;
  text?: WhapiText;
  image?: WhapiImage;
  audio?: WhapiAudio;
  video?: WhapiVideo;
  document?: WhapiDocument;
  interactive?: any; // bouton, liste, menu rapide
  contact?: WhapiContact;
  contact_list?: WhapiContact[];
  location?: WhapiLocation;
  live_location?: WhapiLocation;
  hsm?: WhapiHSM;
  poll?: WhapiPoll;
  order?: WhapiOrder;
  product?: WhapiProduct;
  catalog?: WhapiCatalog;
  group_invite?: WhapiInvite;
  newsletter_invite?: WhapiInvite;
  admin_invite?: WhapiInvite;
}

// --- Statuses ---

export interface WhapiStatus {
  id: string;
  code: number;
  status: string;
  recipient_id: string;
  timestamp: number | string;
}

// --- Interactive ---

export interface WhapiInteractive {
  type: string;
  header?: { text?: string };
  body?: { text?: string };
  footer?: { text?: string };
  action?: any;
}

// --- Contacts ---

export interface WhapiContact {
  name: string;
  vcard: string;
}

// --- Location ---

export interface WhapiLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  url?: string;
  accuracy?: number;
  speed?: number;
  degrees?: number;
  comment?: string;
}

// --- HSM (template) ---

export interface WhapiHSM {
  header?: { type: string; text?: { body: string }; image?: any; video?: any; document?: any; location?: any };
  body?: string;
  footer?: string;
  buttons?: any[];
}

// --- Polls ---

export interface WhapiPoll {
  title: string;
  options: string[];
  vote_limit: number;
  total: number;
  results: { id: string; name: string; count: number; voters: string[] }[];
}

// --- Orders / Products / Catalogs ---

export interface WhapiOrder {
  order_id: string;
  seller: string;
  title: string;
  text: string;
  token: string;
  item_count: number;
  currency: string;
  total_price: number;
  status: string;
  preview?: string;
}

export interface WhapiProduct { catalog_id: string; product_id: string; }

export interface WhapiCatalog {
  id: string;
  catalog_id: string;
  body?: string;
  url?: string;
  link?: string;
  title?: string;
  description?: string;
  newsletter_id?: string;
  invite_code?: string;
  preview?: string;
}

// --- Invites ---

export interface WhapiInvite {
  body?: string;
  url?: string;
  id: string;
  link?: string;
  sha256?: string;
  catalog_id?: string;
  newsletter_id?: string;
  invite_code?: string;
  title?: string;
  description?: string;
  canonical?: string;
  preview?: string;
  expiration?: number;
}

// --- Event (call, join, etc.) ---

export interface WhapiEventData {
  is_canceled?: boolean;
  name?: string;
  description?: string;
  join_link?: string;
  start?: number;
  responses?: any[];
}

// --- Webhook Payload ---

export interface WhapiWebhookPayload {
  channel_id: string;
  event: { type: WhapiEventType; event: string };
  messages?: WhapiMessage[];
  statuses?: WhapiStatus[];
  interactives?: WhapiInteractive[];
  contacts?: WhapiContact[];
  contact_list?: WhapiContact[];
  locations?: WhapiLocation[];
  live_locations?: WhapiLocation[];
  hsms?: WhapiHSM[];
  event_datas?: WhapiEventData[];
  polls?: WhapiPoll[];
  orders?: WhapiOrder[];
  products?: WhapiProduct[];
  catalogs?: WhapiCatalog[];
  invites?: WhapiInvite[];
}

// export interface WhapiWebhookResponse {
//   status: string;
// }