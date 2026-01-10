import { Module } from '@nestjs/common';
import { WhatsappChatEventService } from './whatsapp_chat_event.service';
import { WhatsappChatEventGateway } from './whatsapp_chat_event.gateway';

@Module({
  providers: [WhatsappChatEventGateway, WhatsappChatEventService],
})
export class WhatsappChatEventModule {}
