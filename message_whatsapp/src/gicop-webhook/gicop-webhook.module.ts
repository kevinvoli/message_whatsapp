import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GicopWebhookController } from './gicop-webhook.controller';
import { GicopWebhookService } from './gicop-webhook.service';
import { InboundIntegrationModule } from 'src/inbound-integration/inbound-integration.module';
import { WindowModule } from 'src/window/window.module';
import { CallObligationModule } from 'src/call-obligations/call-obligation.module';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappCommercial]),
    InboundIntegrationModule,
    WindowModule,
    CallObligationModule,
  ],
  controllers: [GicopWebhookController],
  providers: [GicopWebhookService],
})
export class GicopWebhookModule {}
