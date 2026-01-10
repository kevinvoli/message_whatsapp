import { Module } from '@nestjs/common';
import { WhatsappChatService } from './whatsapp_chat.service';
import { WhatsappChatGateway } from './whatsapp_chat.gateway';

@Module({
  providers: [WhatsappChatGateway, WhatsappChatService],
})
export class WhatsappChatModule {}
