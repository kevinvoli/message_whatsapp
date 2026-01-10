import { Module } from '@nestjs/common';
import { WhatsappMessageService } from './whatsapp_message.service';
import { WhatsappMessageGateway } from './whatsapp_message.gateway';

@Module({
  providers: [WhatsappMessageGateway, WhatsappMessageService],
})
export class WhatsappMessageModule {}
