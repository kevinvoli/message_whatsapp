import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { WebhookWorker } from './workers/webhook.worker';
import { BroadcastWorker } from 'src/broadcast/workers/broadcast.worker';
import { SentimentWorker } from 'src/sentiment/sentiment.worker';
import { OutboundWebhookWorker } from 'src/outbound-webhook/workers/outbound-webhook.worker';

@Injectable()
export class BullMQShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(BullMQShutdownService.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Graceful shutdown (${signal ?? 'unknown'}) — fermeture des workers BullMQ...`);

    const workerClasses = [WebhookWorker, BroadcastWorker, SentimentWorker, OutboundWebhookWorker];
    const closePromises = workerClasses.map(async (WorkerClass) => {
      try {
        const instance = this.moduleRef.get(WorkerClass, { strict: false });
        await instance.worker.close();
        this.logger.log(`Worker ${WorkerClass.name} fermé`);
      } catch {
        this.logger.warn(`Worker ${WorkerClass.name} introuvable ou déjà fermé`);
      }
    });

    await Promise.allSettled(closePromises);
    this.logger.log('Tous les workers BullMQ fermés');
  }
}
