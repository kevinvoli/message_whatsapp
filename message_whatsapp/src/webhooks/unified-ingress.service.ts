import { Injectable } from '@nestjs/common';
import { WhapiWebhookPayload } from 'src/whapi/interface/whapi-webhook.interface';
import { MetaWebhookPayload } from 'src/whapi/interface/whatsapp-whebhook.interface';
import { InboundMessageService } from './inbound-message.service';
import { MetaAdapter } from './adapters/meta.adapter';
import { WhapiAdapter } from './adapters/whapi.adapter';

@Injectable()
export class UnifiedIngressService {
  constructor(
    private readonly whapiAdapter: WhapiAdapter,
    private readonly metaAdapter: MetaAdapter,
    private readonly inboundService: InboundMessageService,
  ) {}

  async ingestWhapi(
    payload: WhapiWebhookPayload,
    tenantId: string,
  ): Promise<void> {
    const unifiedMessages = this.whapiAdapter.normalizeMessages(payload, {
      provider: 'whapi',
      tenantId,
      channelId: payload.channel_id,
    });
    const unifiedStatuses = this.whapiAdapter.normalizeStatuses(payload, {
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

  async ingestMeta(
    payload: MetaWebhookPayload,
    tenantId: string,
  ): Promise<void> {
    const entry = payload?.entry?.[0];
    const metaValue = entry?.changes?.[0]?.value;
    const channelId = metaValue?.metadata?.phone_number_id ?? 'unknown';

    const unifiedMessages = this.metaAdapter.normalizeMessages(payload, {
      provider: 'meta',
      tenantId,
      channelId,
    });
    const unifiedStatuses = this.metaAdapter.normalizeStatuses(payload, {
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
}
