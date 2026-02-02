import { Module } from '@nestjs/common';
import { WhapiService } from './whapi.service';
import { WhapiController } from './whapi.controller';
// import { WhatsappAgentService } from 'src/whatsapp_agent/whatsapp_agent.service';
// import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { PendingMessage } from 'src/dispatcher/entities/pending-message.entity';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { DispatcherModule } from 'src/dispatcher/dispatcher.module';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';
import { WhatsappChatModule } from 'src/whatsapp_chat/whatsapp_chat.module';
import { CommunicationWhapiModule } from 'src/communication_whapi/communication_whapi.module';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ChannelService } from 'src/channel/channel.service';
import { Contact } from 'src/contact/entities/contact.entity';
import { ContactService } from 'src/contact/contact.service';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappCommercial,
      WhatsappMessage,
      WhatsappChat,
      PendingMessage,
      QueuePosition,
      WhapiChannel,
      Contact,
      WhatsappPoste,
      WhatsappMedia
    ]),
    DispatcherModule,
    WhatsappMessageModule,
    WhatsappChatModule,
    CommunicationWhapiModule,
  ],
  controllers: [WhapiController],
  providers: [
    WhapiService,
    WhatsappMessageService,
    WhatsappChatService,
    WhatsappCommercialService,
    ChannelService,
    WhatsappPosteService,
    ContactService,
    CommunicationWhapiService,
  ],
})
export class WhapiModule {}
