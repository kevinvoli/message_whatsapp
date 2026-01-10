import { Module } from '@nestjs/common';
import { WhatsappLocationContentService } from './whatsapp_location_content.service';
import { WhatsappLocationContentGateway } from './whatsapp_location_content.gateway';

@Module({
  providers: [WhatsappLocationContentGateway, WhatsappLocationContentService],
})
export class WhatsappLocationContentModule {}
