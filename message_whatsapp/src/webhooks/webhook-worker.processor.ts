import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { UnifiedIngressService } from './unified-ingress.service';
import { WebhookJobData } from './webhook-producer.service';
import { WhapiWebhookPayload } from 'src/whapi/interface/whapi-webhook.interface';
import { MetaWebhookPayload } from 'src/whapi/interface/whatsapp-whebhook.interface';
import { MessengerWebhookPayload } from 'src/whapi/interface/messenger-webhook.interface';
import { InstagramWebhookPayload } from 'src/whapi/interface/instagram-webhook.interface';
import { TelegramWebhookPayload } from 'src/whapi/interface/telegram-webhook.interface';
import { AdapterContext } from './adapters/provider-adapter.interface';

@Processor('webhook-inbound', { concurrency: 15 })
export class WebhookWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookWorkerProcessor.name);

  constructor(
    private readonly unifiedIngressService: UnifiedIngressService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { provider, payload, eventId, context } = job.data;
    this.logger.debug(
      `Processing job id=${job.id} provider=${provider} eventId=${eventId} attempt=${job.attemptsMade + 1}`,
    );

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
        const ctx: AdapterContext = context ?? { provider: 'messenger', tenantId: 'unknown', channelId: 'unknown' };
        await this.unifiedIngressService.ingestMessenger(payload as MessengerWebhookPayload, ctx, eventId);
        break;
      }
      case 'instagram': {
        const ctx: AdapterContext = context ?? { provider: 'instagram', tenantId: 'unknown', channelId: 'unknown' };
        await this.unifiedIngressService.ingestInstagram(payload as InstagramWebhookPayload, ctx, eventId);
        break;
      }
      case 'telegram': {
        const ctx: AdapterContext = context ?? { provider: 'telegram', tenantId: 'unknown', channelId: 'unknown' };
        await this.unifiedIngressService.ingestTelegram(payload as TelegramWebhookPayload, ctx, eventId);
        break;
      }
      default:
        this.logger.warn(
          `Job reçu pour provider inconnu — ignoré. provider=${provider} eventId=${eventId}`,
        );
    }
  }
}
