import { Module } from '@nestjs/common';
import { WhatsappStatusesService } from './whatsapp_statuses.service';
import { WhatsappStatusesGateway } from './whatsapp_statuses.gateway';

@Module({
  providers: [WhatsappStatusesGateway, WhatsappStatusesService],
})
export class WhatsappStatusesModule {}
