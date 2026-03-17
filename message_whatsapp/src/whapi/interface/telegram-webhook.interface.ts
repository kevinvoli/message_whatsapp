export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  username?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  width: number;
  height: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
  title?: string;
  performer?: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  duration: number;
  width: number;
  height: number;
  mime_type?: string;
  file_size?: number;
  thumbnail?: TelegramPhotoSize;
}

export interface TelegramSticker {
  file_id: string;
  file_unique_id: string;
  type: 'regular' | 'mask' | 'custom_emoji';
  width: number;
  height: number;
  is_animated: boolean;
  is_video: boolean;
  file_size?: number;
}

export interface TelegramLocation {
  longitude: number;
  latitude: number;
  horizontal_accuracy?: number;
}

export interface TelegramContact {
  phone_number: string;
  first_name: string;
  last_name?: string;
  user_id?: number;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
}

export interface TelegramReplyTo {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramMessage {
  message_id: number;
  /** Absent si le message vient d'un canal */
  from?: TelegramUser;
  chat: TelegramChat;
  /** Unix timestamp */
  date: number;
  text?: string;
  caption?: string;
  entities?: TelegramMessageEntity[];
  /** Tableau trié par qualité croissante — prendre le dernier */
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  audio?: TelegramAudio;
  voice?: TelegramVoice;
  video?: TelegramVideo;
  sticker?: TelegramSticker;
  location?: TelegramLocation;
  contact?: TelegramContact;
  reply_to_message?: TelegramReplyTo;
  forward_from?: TelegramUser;
  forward_date?: number;
  edit_date?: number;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  channel_post?: TelegramMessage;
}

/** Telegram envoie un seul Update par POST (pas d'array comme Meta) */
export type TelegramWebhookPayload = TelegramUpdate;
