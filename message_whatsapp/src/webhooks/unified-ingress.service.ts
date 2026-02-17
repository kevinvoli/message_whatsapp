import { Injectable, Logger } from '@nestjs/common';
import { WhapiWebhookPayload } from 'src/whapi/interface/whapi-webhook.interface';
import { MetaWebhookPayload } from 'src/whapi/interface/whatsapp-whebhook.interface';
import { InboundMessageService } from './inbound-message.service';
import { ProviderAdapterRegistry } from './adapters/provider-adapter.registry';

@Injectable()
export class UnifiedIngressService {
  private readonly logger = new Logger(UnifiedIngressService.name);
  constructor(
    private readonly adapterRegistry: ProviderAdapterRegistry,
    private readonly inboundService: InboundMessageService,
  ) {}

  async ingestWhapi(
    payload: WhapiWebhookPayload,
    tenantId: string,
  ): Promise<void> {
    const whapiAdapter =
      this.adapterRegistry.getAdapter<WhapiWebhookPayload>('whapi');
    const unifiedMessages = whapiAdapter.normalizeMessages(payload, {
      provider: 'whapi',
      tenantId,
      channelId: payload.channel_id,
    });
    const unifiedStatuses = whapiAdapter.normalizeStatuses(payload, {
      provider: 'whapi',
      tenantId,
      channelId: payload.channel_id,
    });

    if (unifiedMessages.length > 0) {
      await this.inboundService.handleMessages(unifiedMessages);
    }
    if (unifiedStatuses.length > 0) {
      await this.inboundService.handleStatuses(unifiedStatuses);
    }
  }

  async ingestWhapiShadow(
    payload: WhapiWebhookPayload,
    tenantId: string,
  ): Promise<void> {
    const whapiAdapter =
      this.adapterRegistry.getAdapter<WhapiWebhookPayload>('whapi');
    const unifiedMessages = whapiAdapter.normalizeMessages(payload, {
      provider: 'whapi',
      tenantId,
      channelId: payload.channel_id,
    });
    const unifiedStatuses = whapiAdapter.normalizeStatuses(payload, {
      provider: 'whapi',
      tenantId,
      channelId: payload.channel_id,
    });

    const messageIds = unifiedMessages
      .map((m) => m.providerMessageId)
      .filter(Boolean)
      .slice(0, 5)
      .join(',');
    const statusIds = unifiedStatuses
      .map((s) => s.providerMessageId)
      .filter(Boolean)
      .slice(0, 5)
      .join(',');

    this.logger.log(
      `UNIFIED_SHADOW provider=whapi tenant_id=${tenantId} messages=${unifiedMessages.length} statuses=${unifiedStatuses.length} msg_ids=${messageIds || 'none'} status_ids=${statusIds || 'none'}`,
    );
  }

  async ingestMeta(
    payload: MetaWebhookPayload,
    tenantId: string,
  ): Promise<void> {
    const entry = payload?.entry?.[0];
    const metaValue = entry?.changes?.[0]?.value;
    const channelId = metaValue?.metadata?.phone_number_id ?? 'unknown';

    const metaAdapter =
      this.adapterRegistry.getAdapter<MetaWebhookPayload>('meta');
    const unifiedMessages = metaAdapter.normalizeMessages(payload, {
      provider: 'meta',
      tenantId,
      channelId,
    });
    const unifiedStatuses = metaAdapter.normalizeStatuses(payload, {
      provider: 'meta',
      tenantId,
      channelId,
    });

    if (unifiedMessages.length > 0) {
      await this.inboundService.handleMessages(unifiedMessages);
    }
    if (unifiedStatuses.length > 0) {
      await this.inboundService.handleStatuses(unifiedStatuses);
    }
  }

  async ingestMetaShadow(
    payload: MetaWebhookPayload,
    tenantId: string,
  ): Promise<void> {
    const entry = payload?.entry?.[0];
    const metaValue = entry?.changes?.[0]?.value;
    const channelId = metaValue?.metadata?.phone_number_id ?? 'unknown';

    const metaAdapter =
      this.adapterRegistry.getAdapter<MetaWebhookPayload>('meta');
    const unifiedMessages = metaAdapter.normalizeMessages(payload, {
      provider: 'meta',
      tenantId,
      channelId,
    });
    const unifiedStatuses = metaAdapter.normalizeStatuses(payload, {
      provider: 'meta',
      tenantId,
      channelId,
    });

    const messageIds = unifiedMessages
      .map((m) => m.providerMessageId)
      .filter(Boolean)
      .slice(0, 5)
      .join(',');
    const statusIds = unifiedStatuses
      .map((s) => s.providerMessageId)
      .filter(Boolean)
      .slice(0, 5)
      .join(',');

    this.logger.log(
      `UNIFIED_SHADOW provider=meta tenant_id=${tenantId} messages=${unifiedMessages.length} statuses=${unifiedStatuses.length} msg_ids=${messageIds || 'none'} status_ids=${statusIds || 'none'}`,
    );
  }
}
