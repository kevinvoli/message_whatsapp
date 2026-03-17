export interface MessengerSender {
  id: string;
}

export interface MessengerRecipient {
  id: string;
}

export interface MessengerAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'template' | 'fallback';
  payload: {
    url?: string;
    title?: string;
    sticker_id?: number;
  };
}

export interface MessengerQuickReply {
  payload: string;
  title?: string;
}

export interface MessengerMessage {
  mid: string;
  text?: string;
  attachments?: MessengerAttachment[];
  quick_reply?: MessengerQuickReply;
  reply_to?: { mid: string };
  sticker_id?: number;
}

export interface MessengerDelivery {
  mids: string[];
  watermark: number;
}

export interface MessengerRead {
  watermark: number;
}

export interface MessengerPostback {
  payload: string;
  title: string;
}

export interface MessengerMessaging {
  sender: MessengerSender;
  recipient: MessengerRecipient;
  timestamp: number;
  message?: MessengerMessage;
  delivery?: MessengerDelivery;
  read?: MessengerRead;
  postback?: MessengerPostback;
}

export interface MessengerEntry {
  /** page_id */
  id: string;
  time: number;
  messaging: MessengerMessaging[];
}

export interface MessengerWebhookPayload {
  object: 'page';
  entry: MessengerEntry[];
}
