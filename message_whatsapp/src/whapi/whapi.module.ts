import { Module } from '@nestjs/common';
import { WhapiService } from './whapi.service';
import { WhapiController } from './whapi.controller';
// import { WhatsappAgentService } from 'src/whatsapp_agent/whatsapp_agent.service';
// import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhapiServiceDispacher } from './whatsapp_dispacher.service';
import { UsersService } from 'src/users/users.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappCommercial } from 'src/users/entities/user.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { PendingMessage } from 'src/dispatcher/entities/pending-message.entity';
import { QueueService } from 'src/dispatcher/services/queue.service';
import { WhatsappConversationService } from 'src/whatsapp_conversation/whatsapp_conversation.service';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { WhatsappConversation } from 'src/whatsapp_conversation/entities/whatsapp_conversation.entity';


@Module({
   imports:[
      TypeOrmModule.forFeature([WhatsappCommercial,WhatsappMessage, WhatsappChat,PendingMessage,QueuePosition, WhatsappConversation]),
  ],
  controllers: [WhapiController],
  providers: [WhapiService, WhapiServiceDispacher,UsersService,WhatsappMessageService, WhatsappChatService,CommunicationWhapiService, DispatcherService,QueueService,WhatsappConversationService],
})
export class WhapiModule {}