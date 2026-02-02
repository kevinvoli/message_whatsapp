import { Module } from '@nestjs/common';
import { MessageAutoService } from './message-auto.service';
import { MessageAutoController } from './message-auto.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageAuto } from './entities/message-auto.entity';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { QueueService } from 'src/dispatcher/services/queue.service';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { FirstResponseTimeoutJob } from 'src/jorbs/first-response-timeout.job';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { ChannelService } from 'src/channel/channel.service';
import { ContactService } from 'src/contact/contact.service';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { PendingMessage } from 'src/dispatcher/entities/pending-message.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { Contact } from 'src/contact/entities/contact.entity';

@Module({
   imports: [
      TypeOrmModule.forFeature([
        MessageAuto,WhatsappMessage,WhatsappChat, WhatsappCommercial,WhatsappPoste,QueuePosition,PendingMessage,WhapiChannel,
        Contact
      ]),
    ],
  controllers: [MessageAutoController],
  providers: [MessageAutoService,WhatsappMessageGateway, WhatsappChatService, WhatsappMessageService,WhatsappCommercialService,WhatsappPosteService,QueueService,DispatcherService,FirstResponseTimeoutJob,WhatsappPosteService,CommunicationWhapiService,ChannelService,ContactService
  ],
})
export class MessageAutoModule {}
