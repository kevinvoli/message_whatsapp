import { ProviderId } from './unified-message';

export interface UnifiedStatus {
  provider: ProviderId;
  providerMessageId: string;
  tenantId: string;
  channelId: string;
  recipientId: string;
  status: string;
  timestamp: number;
  errorCode?: number;
  errorTitle?: string;
  raw: unknown;
}
