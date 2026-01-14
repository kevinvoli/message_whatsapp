import { Module } from '@nestjs/common';
import { WhatsappMessageService } from './whatsapp_message.service';
import { WhatsappMessageGateway } from './whatsapp_message.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessage } from './entities/whatsapp_message.entity';
import { WhatsappMessageReaction } from 'src/whatsapp_message_reaction/entities/whatsapp_message_reaction.entity';
import { WhatsappMessageEvent } from 'src/whatsapp_message_event/entities/whatsapp_message_event.entity';
import { WhatsappMessageContext } from 'src/whatsapp_message_context/entities/whatsapp_message_context.entity';
import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';
import { WhatsappConversation } from 'src/whatsapp_conversation/entities/whatsapp_conversation.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappChatModule } from 'src/whatsapp_chat/whatsapp_chat.module';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { UsersService } from 'src/users/users.service';
import { WhatsappCommercial } from 'src/users/entities/user.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { DispatcherModule } from 'src/dispatcher/dispatcher.module';

@Module({
   imports: [TypeOrmModule.forFeature([
          WhatsappMessage, WhatsappChat, WhatsappConversation, WhatsappMessageContent, WhatsappMessageContext, WhatsappMessageEvent, WhatsappMessageReaction, WhatsappCommercial
        ]), WhatsappChatModule, DispatcherModule],
  providers: [WhatsappMessageGateway, WhatsappMessageService,WhatsappChatService,UsersService,CommunicationWhapiService],
})
export class WhatsappMessageModule {}
