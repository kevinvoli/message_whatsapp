/* =========================
 * ENUMS & TYPES
 * ========================= */

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

export type WhapiMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'gif'
  | 'short'
  | 'audio'
  | 'voice'
  | 'document'
  | 'sticker'
  | 'location'
  | 'live_location'
  | 'contact'
  | 'contact_list'
  | 'interactive'
  | 'poll'
  | 'hsm'
  | 'system'
  | 'order'
  | 'group_invite'
  | 'newsletter_invite'
  | 'admin_invite'
  | 'product'
  | 'catalog'
  | 'event'
  | 'list'
  | 'buttons'
  | 'reaction';

/* =========================
 * SHARED STRUCTURES
 * ========================= */

export interface WhapiButton {
  type: string;
  title?: string;
  id?: string;
  text?: string;
  url?: string;
  phone_number?: string;
  copy_code?: string;
  merchant_url?: string;
}

export interface WhapiMediaBase {
  id: string;
  link?: string;
  mime_type: string;
  file_size?: number;
  file_name?: string;
  sha256?: string;
  timestamp?: number;
  caption?: string;
  preview?: string;
  view_once?: boolean;
}

/* =========================
 * MEDIA TYPES
 * ========================= */

export interface WhapiImage extends WhapiMediaBase {
  width?: number;
  height?: number;
  buttons?: WhapiButton[];
}

export interface WhapiVideo extends WhapiMediaBase {
  width?: number;
  height?: number;
  seconds?: number;
  autoplay?: boolean;
  buttons?: WhapiButton[];
}

export interface WhapiGif extends WhapiVideo {}
export interface WhapiShort extends WhapiVideo {}

export interface WhapiAudio extends WhapiMediaBase {
  seconds?: number;
  recording_time?: number;
  waveform?: string;
}

export interface WhapiVoice extends WhapiAudio {}

export interface WhapiDocument extends WhapiMediaBase {
  filename?: string;
  page_count?: number;
  buttons?: WhapiButton[];
}

export interface WhapiSticker extends WhapiMediaBase {
  animated?: boolean;
  width?: number;
  height?: number;
}

/* =========================
 * TEXT / INTERACTIVE
 * ========================= */

export interface WhapiText {
  body: string;
  buttons?: WhapiButton[];
  sections?: WhapiSection[];
  button?: string;
  view_once?: boolean;
}

export interface WhapiSection {
  title: string;
  rows: {
    title: string;
    description?: string;
    id: string;
  }[];
  product_items?: {
    catalog_id: string;
    product_id: string;
  }[];
}

export interface WhapiInteractive {
  type: string;
  header?: { text?: string };
  body?: { text?: string };
  footer?: { text?: string };
  action?: any;
}

/* =========================
 * LOCATION
 * ========================= */

export interface WhapiLocation {
  latitude: number;
  longitude: number;
  address?: string;
  name?: string;
  url?: string;
  preview?: string;
  accuracy?: number;
  speed?: number;
  degrees?: number;
  comment?: string;
  view_once?: boolean;
}

/* =========================
 * CONTACTS
 * ========================= */

export interface WhapiContact {
  name: string;
  vcard: string;
}

export interface WhapiContactList {
  list: WhapiContact[];
}

/* =========================
 * POLL
 * ========================= */

export interface WhapiPoll {
  title: string;
  options: string[];
  vote_limit: number;
  total: number;
  results: {
    id: string;
    name: string;
    count: number;
    voters: string[];
  }[];
  view_once?: boolean;
}

/* =========================
 * ORDER / PRODUCT / CATALOG
 * ========================= */

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

export interface WhapiProduct {
  catalog_id: string;
  product_id: string;
}

export interface WhapiCatalog {
  id: string;
  catalog_id?: string;
  title?: string;
  description?: string;
  body?: string;
  url?: string;
  preview?: string;
}

/* =========================
 * CONTEXT / ACTION / EVENT
 * ========================= */

export interface WhapiContext {
  forwarded?: boolean;
  forwarding_score?: number;
  mentions?: string[];
  quoted_id?: string;
  quoted_type?: string;
  quoted_content?: WhapiText;
  quoted_author?: string;
  ephemeral?: number;
}

export interface WhapiAction {
  target?: string;
  type?: string;
  emoji?: string;
  edited_type?: string;
  edited_content?: WhapiText;
}

export interface WhapiEventData {
  is_canceled?: boolean;
  name?: string;
  description?: string;
  join_link?: string;
  start?: number;
  responses?: any[];
}

/* =========================
 * MESSAGE
 * ========================= */

export interface WhapiMessage {
  id: string;
  type: WhapiMessageType;
  subtype?: string;

  channel_id:string;
  chat_id: string;
  chat_name?: string;

  from: string;
  from_me: boolean;
  from_name?: string;

  source: string;
  timestamp: number;
  device_id?: number;
  status?: string;

  text?: WhapiText;

  image?: WhapiImage;
  video?: WhapiVideo;
  gif?: WhapiGif;
  short?: WhapiShort;
  audio?: WhapiAudio;
  voice?: WhapiVoice;
  document?: WhapiDocument;
  sticker?: WhapiSticker;

  location?: WhapiLocation;
  live_location?: WhapiLocation;

  contact?: WhapiContact;
  contact_list?: WhapiContactList;

  interactive?: WhapiInteractive;
  poll?: WhapiPoll;

  order?: WhapiOrder;
  product?: WhapiProduct;
  catalog?: WhapiCatalog;

  context?: WhapiContext;
  action?: WhapiAction;
  event?: WhapiEventData;
}

/* =========================
 * STATUS
 * ========================= */

export interface WhapiStatus {
  id: string;
  code: number;
  status: string;
  recipient_id: string;
  timestamp: number | string;
}

/* =========================
 * WEBHOOK PAYLOAD
 * ========================= */

export interface WhapiWebhookPayload {
  channel_id: string;
  event: {
    type: WhapiEventType;
    event: string;
  };

  messages?: WhapiMessage[];
  statuses?: WhapiStatus[];
   events?: WhapiEventData[];          // anciennement event_datas
  polls?: WhapiPoll[];
  interactives?: WhapiInteractive[];
  contacts?: WhapiContact[];
  contact_list?: WhapiContact[];
  locations?: WhapiLocation[];
  live_locations?: WhapiLocation[];
  // hsms?: WhapiHSM[];                  // reste hsms
  orders?: WhapiOrder[];
  products?: WhapiProduct[];
  catalogs?: WhapiCatalog[];
  // invites?: WhapiInvite[];
}


export interface ExtractedMedia {
  type: WhapiMessageType;
  texte?: string;
  media_id?: string;
  mime_type?: string;
  caption?: string;
  file_name?: string;
  file_size?: number;
  seconds?: number;
  latitude?: number;
  longitude?: number;
  payload?:
    | WhapiRawMedia
    | WhapiContact
    | WhapiContactList
    | WhapiInteractive
    | WhapiPoll
    | WhapiOrder
    | WhapiProduct
    | WhapiCatalog
    | WhapiEventData;
}

export interface WhapiRawMedia {
  id?: string;
  mime_type?: string;
  file_size?: number;
  sha256?: string;
  link?: string;
  seconds?: number;
}