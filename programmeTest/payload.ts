// ============================================================
// Whapi types
// ============================================================

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
  | 'interactive'
  | 'reply';

export interface WhapiMediaBase {
  id: string;
  mime_type: string;
  link?: string;
  file_size?: number;
  sha256?: string;
}

export interface WhapiMessage {
  id: string;
  from_me: boolean;
  type: WhapiMessageType;
  chat_id: string;
  timestamp: number;
  source: string;
  from: string;
  from_name?: string;
  text?: string | { body: string };
  image?: WhapiMediaBase & { caption?: string };
  video?: WhapiMediaBase & { caption?: string };
  audio?: WhapiMediaBase;
  voice?: WhapiMediaBase;
  document?: WhapiMediaBase & { filename?: string };
  sticker?: WhapiMediaBase;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  reply?: {
    type: string;
    buttons_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

export interface WhapiStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'played' | 'deleted';
  chat_id: string;
  recipient_id: string;
  timestamp: number;
  code?: number;
}

export interface WhapiWebhookPayload {
  messages?: WhapiMessage[];
  statuses?: WhapiStatus[];
  event: { type: string; event: string };
  channel_id: string;
}

// ============================================================
// Meta types
// ============================================================

export interface MetaMediaPayload {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
}

export interface MetaMessagePayload {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: MetaMediaPayload;
  video?: MetaMediaPayload;
  audio?: MetaMediaPayload;
  document?: MetaMediaPayload & { filename?: string };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { payload: string; text: string };
}

export interface MetaStatusPayload {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}

export interface MetaWebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      field: 'messages';
      value: {
        messaging_product: 'whatsapp';
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          wa_id: string;
          profile: { name: string };
        }>;
        messages?: MetaMessagePayload[];
        statuses?: MetaStatusPayload[];
      };
    }>;
  }>;
}
