import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { OutboundWebhookService } from '../outbound-webhook.service';
import { DeadLetterService } from 'src/queue/dead-letter.service';

export const OUTBOUND_WEBHOOK_QUEUE = 'outbound-webhook-delivery';

export interface OutboundWebhookJobPayload {
  webhookId: string;
  logId: string;
  event: string;
  payload: Record<string, unknown>;
}

@Processor(OUTBOUND_WEBHOOK_QUEUE, {
  concurrency: parseInt(process.env['OUTBOUND_WEBHOOK_CONCURRENCY'] ?? '3', 10),
})
export class OutboundWebhookWorker extends WorkerHost {
  private readonly logger = new Logger(OutboundWebhookWorker.name);

  constructor(
    private readonly service: OutboundWebhookService,
    private readonly dlqService: DeadLetterService,
  ) {
    super();
  }

  async process(job: Job<OutboundWebhookJobPayload>): Promise<void> {
    const { webhookId, logId, event, payload } = job.data;
    try {
      await this.service.processJobDelivery(webhookId, logId, event, payload);
    } catch (err) {
      this.logger.error(
        `OutboundWebhookWorker job=${job.id} webhookId=${webhookId} attempt=${job.attemptsMade + 1} error=${err instanceof Error ? err.message : String(err)}`,
      );
      if (job.attemptsMade >= (job.opts.attempts ?? 3) - 1) {
        await this.dlqService.enqueue(OUTBOUND_WEBHOOK_QUEUE, job, err);
      }
      throw err;
    }
  }
}
