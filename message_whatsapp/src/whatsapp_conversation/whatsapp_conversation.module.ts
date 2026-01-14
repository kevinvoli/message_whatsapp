import { Module } from '@nestjs/common';
import { WhatsappConversationService } from './whatsapp_conversation.service';
import { WhatsappConversationGateway } from './whatsapp_conversation.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappConversation } from './entities/whatsapp_conversation.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCustomer } from 'src/whatsapp_customer/entities/whatsapp_customer.entity';

@Module({
   imports: [TypeOrmModule.forFeature([
          WhatsappConversation,WhatsappCustomer , WhatsappChat, WhatsappMessage
        ])],
  providers: [WhatsappConversationGateway, WhatsappConversationService],
  exports: [WhatsappConversationService],
})
export class WhatsappConversationModule {}
