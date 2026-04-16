import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboundWebhook } from './entities/outbound-webhook.entity';
import { OutboundWebhookLog } from './entities/outbound-webhook-log.entity';
import { OutboundWebhookService } from './outbound-webhook.service';
import { OutboundWebhookController } from './outbound-webhook.controller';
import { OutboundWebhookListener } from './outbound-webhook.listener';

@Module({
  imports: [TypeOrmModule.forFeature([OutboundWebhook, OutboundWebhookLog])],
  providers: [OutboundWebhookService, OutboundWebhookListener],
  controllers: [OutboundWebhookController],
  exports: [OutboundWebhookService],
})
export class OutboundWebhookModule {}
