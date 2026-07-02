import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WebhookDegradedQueueService } from 'src/whapi/webhook-degraded-queue.service';
import { UnifiedIngressService } from './unified-ingress.service';
import { WhapiWebhookPayload } from 'src/whapi/interface/whapi-webhook.interface';
import { MetaWebhookPayload } from 'src/whapi/interface/whatsapp-whebhook.interface';
import { MessengerWebhookPayload } from 'src/whapi/interface/messenger-webhook.interface';
import { InstagramWebhookPayload } from 'src/whapi/interface/instagram-webhook.interface';
import { TelegramWebhookPayload } from 'src/whapi/interface/telegram-webhook.interface';
import { AdapterContext } from './adapters/provider-adapter.interface';

export interface WebhookJobData {
  provider: string;
  payload: unknown;
  eventId: string;
  context?: AdapterContext;
}

@Injectable()
export class WebhookProducerService {
  private readonly logger = new Logger(WebhookProducerService.name);

  constructor(
    @InjectQueue('webhook-inbound')
    private readonly queue: Queue<WebhookJobData>,
    private readonly degradedQueue: WebhookDegradedQueueService,
    private readonly unifiedIngressService: UnifiedIngressService,
  ) {}

  async enqueueIngestion(
    provider: string,
    payload: unknown,
    eventId: string,
    context?: AdapterContext,
  ): Promise<void> {
    try {
      await this.queue.add(
        'ingest',
        { provider, payload, eventId, context },
        {
          jobId: eventId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 500,
          removeOnFail: 200,
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Redis unavailable';
      this.logger.error(
        `BullMQ enqueue failed — fallback in-memory. provider=${provider} eventId=${eventId} error=${message}`,
      );
      this.degradedQueue.enqueue(provider, {
        run: () => this.processIngestion(provider, payload, eventId, context),
      });
    }
  }

  private async processIngestion(
    provider: string,
    payload: unknown,
    eventId: string,
    context?: AdapterContext,
  ): Promise<void> {
    switch (provider) {
      case 'whapi': {
        const whapiPayload = payload as WhapiWebhookPayload;
        const tenantId = whapiPayload.channel_id ?? 'unknown';
        await this.unifiedIngressService.ingestWhapi(whapiPayload, tenantId, eventId);
        break;
      }
      case 'meta': {
        const metaPayload = payload as MetaWebhookPayload;
        const tenantId = metaPayload?.entry?.[0]?.id ?? 'unknown';
        await this.unifiedIngressService.ingestMeta(metaPayload, tenantId, eventId);
        break;
      }
      case 'messenger': {
        const ctx = context ?? { provider: 'messenger', tenantId: 'unknown', channelId: 'unknown' };
        await this.unifiedIngressService.ingestMessenger(payload as MessengerWebhookPayload, ctx, eventId);
        break;
      }
      case 'instagram': {
        const ctx = context ?? { provider: 'instagram', tenantId: 'unknown', channelId: 'unknown' };
        await this.unifiedIngressService.ingestInstagram(payload as InstagramWebhookPayload, ctx, eventId);
        break;
      }
      case 'telegram': {
        const ctx = context ?? { provider: 'telegram', tenantId: 'unknown', channelId: 'unknown' };
        await this.unifiedIngressService.ingestTelegram(payload as TelegramWebhookPayload, ctx, eventId);
        break;
      }
      default:
        this.logger.warn(`processIngestion: provider inconnu ignoré provider=${provider}`);
    }
  }
}
