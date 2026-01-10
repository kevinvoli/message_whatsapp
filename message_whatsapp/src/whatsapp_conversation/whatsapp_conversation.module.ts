import { Module } from '@nestjs/common';
import { WhatsappConversationService } from './whatsapp_conversation.service';
import { WhatsappConversationGateway } from './whatsapp_conversation.gateway';

@Module({
  providers: [WhatsappConversationGateway, WhatsappConversationService],
})
export class WhatsappConversationModule {}
