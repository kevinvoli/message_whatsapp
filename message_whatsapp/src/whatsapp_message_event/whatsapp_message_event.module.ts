import { Module } from '@nestjs/common';
import { WhatsappMessageEventService } from './whatsapp_message_event.service';
import { WhatsappMessageEventGateway } from './whatsapp_message_event.gateway';

@Module({
  providers: [WhatsappMessageEventGateway, WhatsappMessageEventService],
})
export class WhatsappMessageEventModule {}
