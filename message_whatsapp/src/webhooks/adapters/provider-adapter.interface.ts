import { UnifiedMessage } from '../normalization/unified-message';
import { UnifiedStatus } from '../normalization/unified-status';

export type AdapterContext = {
  provider: string;
  tenantId: string;
  channelId: string;
};

export interface ProviderAdapter<Payload> {
  normalizeMessages(
    payload: Payload,
    context: AdapterContext,
  ): UnifiedMessage[];
  normalizeStatuses(payload: Payload, context: AdapterContext): UnifiedStatus[];
}
