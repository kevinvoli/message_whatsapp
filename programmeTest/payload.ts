// ============================================================
// Shared / all providers
// ============================================================

export type ProviderType = 'whapi' | 'meta' | 'messenger' | 'instagram' | 'telegram';

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

// ============================================================
// Messenger types
// ============================================================

export interface MessengerMessage {
  mid: string;
  text?: string;
  attachments?: Array<{
    type: 'image' | 'video' | 'audio' | 'file' | 'template' | 'fallback';
    payload: { url?: string };
  }>;
  reply_to?: { mid: string };
  sticker_id?: number;
  quick_reply?: { payload: string; title?: string };
}

export interface MessengerMessaging {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: MessengerMessage;
  delivery?: { mids: string[]; watermark: number };
  read?: { watermark: number };
  postback?: { payload: string; title: string };
}

export interface MessengerWebhookPayload {
  object: 'page';
  entry: Array<{
    /** page_id */
    id: string;
    time: number;
    messaging: MessengerMessaging[];
  }>;
}

// ============================================================
// Instagram types
// ============================================================

export interface InstagramMessage {
  mid: string;
  text?: string;
  attachments?: Array<{
    type: 'image' | 'video' | 'audio' | 'file' | 'ig_reel' | 'reel' | 'share' | 'story_mention' | 'fallback';
    payload: { url?: string };
  }>;
  reply_to?: { mid: string };
  is_deleted?: boolean;
  is_unsupported?: boolean;
}

export interface InstagramMessaging {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: InstagramMessage;
  read?: { watermark: number };
}

export interface InstagramWebhookPayload {
  object: 'instagram';
  entry: Array<{
    /** instagram_business_account_id */
    id: string;
    time: number;
    messaging: InstagramMessaging[];
  }>;
}

// ============================================================
// Telegram types
// ============================================================

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  first_name?: string;
  username?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  /** Unix timestamp */
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  video?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number };
  audio?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number };
  voice?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number };
  document?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
  sticker?: { file_id: string; file_unique_id: string; width: number; height: number; is_animated: boolean; is_video: boolean; file_size?: number };
  location?: { latitude: number; longitude: number };
  reply_to_message?: { message_id: number; from?: TelegramUser; chat: TelegramChat; date: number; text?: string };
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

/** Un seul Update par POST */
export interface TelegramWebhookPayload {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}
