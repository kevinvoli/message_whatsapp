import { Module } from '@nestjs/common';
import { GicopWebhookController } from './gicop-webhook.controller';
import { GicopWebhookService } from './gicop-webhook.service';
import { InboundIntegrationModule } from 'src/inbound-integration/inbound-integration.module';
import { WindowModule } from 'src/window/window.module';

@Module({
  imports: [
    InboundIntegrationModule,
    WindowModule,
  ],
  controllers: [GicopWebhookController],
  providers: [GicopWebhookService],
})
export class GicopWebhookModule {}
