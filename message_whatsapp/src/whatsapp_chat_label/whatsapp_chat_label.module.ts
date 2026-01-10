import { Module } from '@nestjs/common';
import { WhatsappChatLabelService } from './whatsapp_chat_label.service';
import { WhatsappChatLabelGateway } from './whatsapp_chat_label.gateway';

@Module({
  providers: [WhatsappChatLabelGateway, WhatsappChatLabelService],
})
export class WhatsappChatLabelModule {}
