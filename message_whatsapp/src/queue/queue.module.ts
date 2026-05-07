import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullMQShutdownService } from './bullmq-shutdown.service';
import { DeadLetterService } from './dead-letter.service';
import { QueueAdminController } from './queue-admin.controller';
import {
  WEBHOOK_PROCESSING_QUEUE,
  BROADCAST_QUEUE,
  OUTBOUND_WEBHOOK_QUEUE,
  DEAD_LETTER_QUEUE,
  SENTIMENT_QUEUE,
} from './queue.constants';

export {
  WEBHOOK_PROCESSING_QUEUE,
  BROADCAST_QUEUE,
  OUTBOUND_WEBHOOK_QUEUE,
  DEAD_LETTER_QUEUE,
  SENTIMENT_QUEUE,
} from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('REDIS_HOST');
        const port = config.get<number>('REDIS_PORT') ?? 6379;
        const password = config.get<string>('REDIS_PASSWORD') || undefined;
        const prefix = config.get<string>('BULLMQ_PREFIX') || undefined;
        return {
          connection: { host: host ?? 'localhost', port, password },
          ...(prefix && { prefix }),
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
    BullModule.registerQueue({ name: DEAD_LETTER_QUEUE }),
    // Enregistrés ici pour que QueueAdminController puisse injecter les instances
    BullModule.registerQueue({ name: BROADCAST_QUEUE }),
    BullModule.registerQueue({ name: SENTIMENT_QUEUE }),
    BullModule.registerQueue({ name: OUTBOUND_WEBHOOK_QUEUE }),
  ],
  controllers: [QueueAdminController],
  providers: [BullMQShutdownService, DeadLetterService],
  exports: [BullModule, BullMQShutdownService, DeadLetterService],
})
export class QueueModule {}
