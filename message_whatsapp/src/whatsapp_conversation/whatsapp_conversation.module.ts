import { Module } from '@nestjs/common';
import { WhatsappConversationService } from './whatsapp_conversation.service';
import { WhatsappConversationGateway } from './whatsapp_conversation.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappConversation } from './entities/whatsapp_conversation.entity';
import { WhatsappAgent } from 'src/whatsapp_agent/entities/whatsapp_agent.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCustomer } from 'src/whatsapp_customer/entities/whatsapp_customer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappConversation,
      WhatsappCustomer,
      WhatsappChat,
      WhatsappMessage,
      WhatsappAgent,
    ]),
  ],
  providers: [WhatsappConversationGateway, WhatsappConversationService],
})
export class WhatsappConversationModule {}
