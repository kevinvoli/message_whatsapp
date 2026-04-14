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
  raw: unknown;
  /** Identifiant de corrélation généré à l'entrée du webhook HTTP — permet de relier tous les logs du pipeline à la même requête entrante. */
  correlationId?: string;
}
