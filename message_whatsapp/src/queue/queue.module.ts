import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * P2.1 — QueueModule
 *
 * Module global BullMQ branché sur Redis.
 * Si REDIS_HOST n'est pas configuré, les jobs sont ignorés silencieusement
 * (le contrôleur webhook gardera son comportement synchrone actuel).
 *
 * Queues disponibles :
 *   - WEBHOOK_PROCESSING_QUEUE : traitement asynchrone des webhooks entrants
 */

export const WEBHOOK_PROCESSING_QUEUE = 'webhook-processing';
export const BROADCAST_QUEUE = 'broadcast-sending';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('REDIS_HOST');
        const port = config.get<number>('REDIS_PORT') ?? 6379;
        const password = config.get<string>('REDIS_PASSWORD') || undefined;
        return {
          connection: { host: host ?? 'localhost', port, password },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 500 },
          },
        };
      },
    }),
    BullModule.registerQueue({ name: WEBHOOK_PROCESSING_QUEUE }),
    BullModule.registerQueue({ name: BROADCAST_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
