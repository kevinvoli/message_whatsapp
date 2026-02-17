import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { WhapiWebhookPayload } from './interface/whapi-webhook.interface';
import { ChannelService } from 'src/channel/channel.service';
import { UnifiedIngressService } from 'src/webhooks/unified-ingress.service';
import { WebhookIdempotencyService } from 'src/webhooks/idempotency/webhook-idempotency.service';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { WhapiStatus } from './interface/whapi-webhook.interface';

@Injectable()
export class WhapiService {
  private readonly logger = new Logger(WhapiService.name);

  constructor(
    private readonly channelService: ChannelService,
    private readonly unifiedIngressService: UnifiedIngressService,
    private readonly idempotencyService: WebhookIdempotencyService,
    private readonly dispatcherService: DispatcherService,
    private readonly whatsappMessageService: WhatsappMessageService,
    private readonly messageGateway: WhatsappMessageGateway,
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
  ): Promise<'accepted' | 'duplicate' | 'conflict'> {
    return this.idempotencyService.check({
      payload,
      provider,
      tenantId,
    });
  }

  async hasPersistedIncomingMessage(
    provider: 'whapi' | 'meta',
    providerMessageId: string,
  ): Promise<boolean> {
    const existing =
      await this.whatsappMessageService.findIncomingByProviderMessageId(
        provider,
        providerMessageId,
      );
    return Boolean(existing);
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
    if (this.isUnifiedRouterEnabled()) {
      await this.unifiedIngressService.ingestWhapi(payload, tenantId);
    } else {
      await this.handleIncomingMessageLegacy(payload, tenantId);
      if (this.isShadowUnifiedEnabled()) {
        await this.unifiedIngressService.ingestWhapiShadow(payload, tenantId);
      }
    }
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
    if (this.isUnifiedRouterEnabled()) {
      await this.unifiedIngressService.ingestWhapi(payload, tenantId);
    } else {
      await this.updateStatusMessageLegacy(payload.statuses ?? []);
      if (this.isShadowUnifiedEnabled()) {
        await this.unifiedIngressService.ingestWhapiShadow(payload, tenantId);
      }
    }
  }

  async handleMetaWebhook(payload: unknown, tenantId: string): Promise<void> {
    await this.unifiedIngressService.ingestMeta(payload as any, tenantId);
  }

  private async handleIncomingMessageLegacy(
    payload: WhapiWebhookPayload,
    tenantId: string,
  ): Promise<void> {
    const messages = payload.messages ?? [];
    for (const message of messages) {
      if (message.from_me) {
        continue;
      }
      const chatId = message.chat_id;
      if (!this.isValidLegacyChatId(chatId)) {
        this.logger.warn(
          `LEGACY_IGNORED reason=invalid_chat_id chat_id=${chatId ?? 'unknown'}`,
        );
        continue;
      }
      const traceId = message.id ?? `chat:${chatId}:${Date.now()}`;
      try {
        const conversation = await this.dispatcherService.assignConversation(
          chatId,
          message.from_name ?? message.from ?? 'Client',
          traceId,
        );
        if (!conversation) {
          this.logger.warn(
            `LEGACY_NO_AGENT trace=${traceId} chat_id=${chatId}`,
          );
          continue;
        }
        const saved = await this.whatsappMessageService.saveIncomingFromWhapi(
          message,
          conversation,
        );
        const full = await this.whatsappMessageService.findOneWithMedias(
          saved.id,
        );
        if (full) {
          await this.messageGateway.notifyNewMessage(full, conversation);
        }
        this.logger.log(
          `LEGACY_PERSISTED trace=${traceId} tenant_id=${tenantId} message_id=${saved.id}`,
        );
      } catch (error: any) {
        this.logger.error(
          `LEGACY_PROCESSING_FAILED trace=${traceId} error=${error?.message ?? 'unknown'}`,
        );
        throw error;
      }
    }
  }

  private async updateStatusMessageLegacy(
    statuses: WhapiStatus[],
  ): Promise<void> {
    for (const status of statuses) {
      await this.whatsappMessageService.updateByStatus({
        id: status.id,
        recipient_id: status.recipient_id,
        status: status.status,
      });
    }
  }

  private isUnifiedRouterEnabled(): boolean {
    return this.readFlag('FF_UNIFIED_WEBHOOK_ROUTER', true);
  }

  private isShadowUnifiedEnabled(): boolean {
    return this.readFlag('FF_SHADOW_UNIFIED', false);
  }

  private readFlag(name: string, defaultValue: boolean): boolean {
    const raw = process.env[name];
    if (raw == null || raw === '') {
      return defaultValue;
    }
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
  }

  private isValidLegacyChatId(chatId?: string | null): boolean {
    if (!chatId || typeof chatId !== 'string') return false;
    const trimmed = chatId.trim();
    if (!trimmed.includes('@')) return false;
    if (trimmed.endsWith('@g.us')) return false;
    const phone = (trimmed.split('@')[0] ?? '').replace(/[^\d]/g, '');
    return phone.length >= 8 && phone.length <= 20;
  }
}
