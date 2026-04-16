import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WhapiService } from 'src/whapi/whapi.service';
import { UnifiedIngressService } from 'src/webhooks/unified-ingress.service';
import { WEBHOOK_PROCESSING_QUEUE, } from '../queue.module';
import { WebhookJobData } from '../jobs/webhook-processing.job';

/**
 * P2.1 — WebhookWorker
 *
 * Worker BullMQ qui consomme les jobs de la queue WEBHOOK_PROCESSING_QUEUE.
 * Reprend exactement le traitement que faisait le contrôleur de manière synchrone.
 *
 * Retry : 3 tentatives avec backoff exponentiel (1s, 2s, 4s).
 * Concurrence : configurable via BULL_CONCURRENCY (default 5).
 */
@Processor(WEBHOOK_PROCESSING_QUEUE, {
  concurrency: parseInt(process.env.BULL_CONCURRENCY ?? '5', 10),
})
export class WebhookWorker extends WorkerHost {
  private readonly logger = new Logger(WebhookWorker.name);

  constructor(
    private readonly whapiService: WhapiService,
    private readonly unifiedIngressService: UnifiedIngressService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { provider, payload, tenantId, channelId, correlationId, eventType, enqueuedAt } = job.data;

    const queueLatency = Date.now() - enqueuedAt;
    this.logger.log(
      `WORKER_START job=${job.id} provider=${provider} event=${eventType} tenant=${tenantId} queue_latency=${queueLatency}ms attempt=${job.attemptsMade + 1}`,
    );

    try {
      switch (provider) {
        case 'whapi':
          if (eventType === 'messages') {
            await this.whapiService.handleIncomingMessage(payload as any, tenantId, correlationId);
          } else if (eventType === 'statuses') {
            await this.whapiService.updateStatusMessage(payload as any, tenantId, correlationId);
          }
          break;

        case 'meta':
          await this.whapiService.handleMetaWebhook(payload as any, tenantId, correlationId);
          break;

        case 'messenger':
          await this.unifiedIngressService.ingestMessenger(payload as any, {
            provider: 'messenger',
            tenantId,
            channelId,
          }, correlationId);
          break;

        case 'instagram':
          await this.unifiedIngressService.ingestInstagram(payload as any, {
            provider: 'instagram',
            tenantId,
            channelId,
          }, correlationId);
          break;

        case 'telegram':
          await this.unifiedIngressService.ingestTelegram(payload as any, {
            provider: 'telegram',
            tenantId,
            channelId,
          }, correlationId);
          break;

        default:
          this.logger.warn(`WORKER_UNKNOWN_PROVIDER provider=${provider} — job ignoré`);
      }

      this.logger.log(
        `WORKER_DONE job=${job.id} provider=${provider} duration=${Date.now() - enqueuedAt}ms`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `WORKER_ERROR job=${job.id} provider=${provider} attempt=${job.attemptsMade + 1} error=${message}`,
      );
      throw err; // BullMQ reprend en charge le retry
    }
  }
}
