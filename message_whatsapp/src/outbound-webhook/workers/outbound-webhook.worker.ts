import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { OutboundWebhookService } from '../outbound-webhook.service';

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

  constructor(private readonly service: OutboundWebhookService) {
    super();
  }

  async process(job: Job<OutboundWebhookJobPayload>): Promise<void> {
    const { webhookId, logId, event, payload } = job.data;
    await this.service.processJobDelivery(webhookId, logId, event, payload);
  }
}
