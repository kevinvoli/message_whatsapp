import { Injectable, Logger } from '@nestjs/common';
import { WhapiWebhookPayload } from 'src/whapi/interface/whapi-webhook.interface';
import { MetaWebhookPayload } from 'src/whapi/interface/whatsapp-whebhook.interface';
import { MessengerWebhookPayload } from 'src/whapi/interface/messenger-webhook.interface';
import { InstagramWebhookPayload } from 'src/whapi/interface/instagram-webhook.interface';
import { TelegramWebhookPayload } from 'src/whapi/interface/telegram-webhook.interface';
import { ProviderAdapterRegistry } from './adapters/provider-adapter.registry';
import { AdapterContext } from './adapters/provider-adapter.interface';
import { CommandBus } from '@nestjs/cqrs';
import { HandleInboundMessageCommand } from 'src/application/commands/handle-inbound-message.command';
import { UpdateMessageStatusCommand } from 'src/application/commands/update-message-status.command';

@Injectable()
export class UnifiedIngressService {
  private readonly logger = new Logger(UnifiedIngressService.name);
  constructor(
    private readonly adapterRegistry: ProviderAdapterRegistry,
    private readonly commandBus: CommandBus,
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
      await this.commandBus.execute(new HandleInboundMessageCommand(unifiedMessages));
    }
    if (unifiedStatuses.length > 0) {
      await this.commandBus.execute(new UpdateMessageStatusCommand(unifiedStatuses));
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
      await this.commandBus.execute(new HandleInboundMessageCommand(unifiedMessages));
    }
    if (unifiedStatuses.length > 0) {
      await this.commandBus.execute(new UpdateMessageStatusCommand(unifiedStatuses));
    }
  }

  async ingestMessenger(
    payload: MessengerWebhookPayload,
    context: AdapterContext,
  ): Promise<void> {
    const messengerAdapter =
      this.adapterRegistry.getAdapter<MessengerWebhookPayload>('messenger');
    const unifiedMessages = messengerAdapter.normalizeMessages(payload, context);
    const unifiedStatuses = messengerAdapter.normalizeStatuses(payload, context);

    if (unifiedMessages.length > 0) {
      await this.commandBus.execute(new HandleInboundMessageCommand(unifiedMessages));
    }
    if (unifiedStatuses.length > 0) {
      await this.commandBus.execute(new UpdateMessageStatusCommand(unifiedStatuses));
    }
  }

  async ingestInstagram(
    payload: InstagramWebhookPayload,
    context: AdapterContext,
  ): Promise<void> {
    const instagramAdapter =
      this.adapterRegistry.getAdapter<InstagramWebhookPayload>('instagram');
    const unifiedMessages = instagramAdapter.normalizeMessages(payload, context);
    const unifiedStatuses = instagramAdapter.normalizeStatuses(payload, context);

    if (unifiedMessages.length > 0) {
      await this.commandBus.execute(new HandleInboundMessageCommand(unifiedMessages));
    }
    if (unifiedStatuses.length > 0) {
      await this.commandBus.execute(new UpdateMessageStatusCommand(unifiedStatuses));
    }
  }

  async ingestTelegram(
    payload: TelegramWebhookPayload,
    context: AdapterContext,
  ): Promise<void> {
    const telegramAdapter =
      this.adapterRegistry.getAdapter<TelegramWebhookPayload>('telegram');
    const unifiedMessages = telegramAdapter.normalizeMessages(payload, context);
    // Telegram n'a pas de statuts
    if (unifiedMessages.length > 0) {
      await this.commandBus.execute(new HandleInboundMessageCommand(unifiedMessages));
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
