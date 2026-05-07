import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { OutboundWebhook } from './entities/outbound-webhook.entity';
import { OutboundWebhookLog } from './entities/outbound-webhook-log.entity';
import { OutboundWebhookService } from './outbound-webhook.service';
import { OutboundWebhookController } from './outbound-webhook.controller';
import { OutboundWebhookListener } from './outbound-webhook.listener';
import { QueueModule } from 'src/queue/queue.module';
import {
  OUTBOUND_WEBHOOK_QUEUE,
  OutboundWebhookWorker,
} from './workers/outbound-webhook.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboundWebhook, OutboundWebhookLog]),
    QueueModule,
    BullModule.registerQueue({ name: OUTBOUND_WEBHOOK_QUEUE }),
  ],
  providers: [OutboundWebhookService, OutboundWebhookListener, OutboundWebhookWorker],
  controllers: [OutboundWebhookController],
  exports: [OutboundWebhookService],
})
export class OutboundWebhookModule {}
