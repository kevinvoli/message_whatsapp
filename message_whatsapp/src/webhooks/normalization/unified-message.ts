export type ProviderId = 'whapi' | 'meta' | string;

export type UnifiedMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'sticker'
  | 'gif'
  | 'short'
  | 'location'
  | 'live_location'
  | 'interactive'
  | 'button'
  | 'reaction'
  | 'contacts'
  | 'system'
  | 'unsupported'
  | 'unknown';

export type UnifiedDirection = 'in' | 'out';

export interface UnifiedMedia {
  id: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  caption?: string;
  sha256?: string;
  link?: string;
  seconds?: number;
}

export interface UnifiedLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface UnifiedInteractive {
  kind: 'button_reply' | 'list_reply' | 'unknown';
  id?: string;
  title?: string;
  description?: string;
}

export interface UnifiedReferral {
  sourceUrl: string;
  sourceType: 'ad' | 'post' | 'unknown';
  sourceId: string;
  headline?: string;
  body?: string;
  ctwaClid?: string;
}

export interface UnifiedMessage {
  provider: ProviderId;
  providerMessageId: string;
  tenantId: string;
  channelId: string;
  chatId: string;
  from: string;
  fromName?: string;
  timestamp: number;
  direction: UnifiedDirection;
  type: UnifiedMessageType;
  text?: string;
  media?: UnifiedMedia;
  location?: UnifiedLocation;
  interactive?: UnifiedInteractive;
  /** Provider message ID of the quoted message (Whapi: context.quoted_id) */
  quotedProviderMessageId?: string;
  /** Referral from a Meta ad or post (first message only) */
  referral?: UnifiedReferral;
  raw: unknown;
}
