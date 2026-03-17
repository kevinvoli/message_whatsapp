export interface OutboundSendResponse {
  providerMessageId: string;
  provider: 'whapi' | 'meta' | 'messenger' | string;
  /** ID du média chez le provider (Meta upload ID ou Whapi media ID) */
  providerMediaId?: string | null;
  /** URL CDN directe retournée par le provider (Whapi uniquement) */
  mediaUrl?: string | null;
}
