import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { WhapiWebhookPayload } from './interface/whapi-webhook.interface';
import { ChannelService } from 'src/channel/channel.service';
import { UnifiedIngressService } from 'src/webhooks/unified-ingress.service';
import { WebhookIdempotencyService } from 'src/webhooks/idempotency/webhook-idempotency.service';

@Injectable()
export class WhapiService {
  constructor(
    private readonly channelService: ChannelService,
    private readonly unifiedIngressService: UnifiedIngressService,
    private readonly idempotencyService: WebhookIdempotencyService,
  ) {}

  async findChannelByExternalId(channelId: string) {
    return this.channelService.findByChannelId(channelId);
  }

  async ensureTenantId(channel: { id: string; tenant_id?: string | null }) {
    return this.channelService.ensureTenantId(channel as any);
  }

  async upsertProviderMapping(params: {
    tenant_id: string;
    provider: string;
    external_id: string;
    channel_id?: string | null;
  }) {
    await this.channelService.upsertProviderMapping(params);
  }

  async resolveTenantByProviderExternalId(
    provider: string,
    externalId: string,
  ): Promise<string | null> {
    return this.channelService.resolveTenantByProviderExternalId(
      provider,
      externalId,
    );
  }

  async isReplayEvent(
    payload: unknown,
    provider: 'whapi' | 'meta',
    tenantId?: string | null,
  ): Promise<boolean> {
    return this.idempotencyService.isDuplicate({
      payload,
      provider,
      tenantId,
    });
  }

  // ======================================================
  // INCOMING MESSAGE
  // ======================================================
  async handleIncomingMessage(
    payload: WhapiWebhookPayload,
    tenantId?: string,
  ): Promise<void> {
    if (!payload?.messages?.length) return;
    if (!tenantId) {
      throw new HttpException(
        'Missing tenant id',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    await this.unifiedIngressService.ingestWhapi(payload, tenantId);
  }

  // ======================================================
  // STATUS UPDATE
  // ======================================================
  async updateStatusMessage(
    payload: WhapiWebhookPayload,
    tenantId?: string,
  ): Promise<void> {
    if (!payload?.statuses?.length) return;
    if (!tenantId) {
      throw new HttpException(
        'Missing tenant id',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    await this.unifiedIngressService.ingestWhapi(payload, tenantId);
  }

  async handleMetaWebhook(payload: unknown, tenantId: string): Promise<void> {
    await this.unifiedIngressService.ingestMeta(payload as any, tenantId);
  }


}

