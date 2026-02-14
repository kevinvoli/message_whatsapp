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
  | 'unknown';

export type UnifiedDirection = 'in' | 'out';

export interface UnifiedMedia {
  id: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  caption?: string;
  sha256?: string;
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
  raw: unknown;
}
