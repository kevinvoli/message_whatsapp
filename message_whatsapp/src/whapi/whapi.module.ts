import { Module } from '@nestjs/common';
import { WhapiService } from './whapi.service';
import { WhapiController } from './whapi.controller';
// import { WhatsappAgentService } from 'src/whatsapp_agent/whatsapp_agent.service';
// import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhapiServiceDispacher } from './whatsapp_dispacher.service';
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
import { ChannelModule } from 'src/channel/channel.module';
import { forwardRef } from '@nestjs/common';
import { WhatsappCommercialModule } from 'src/whatsapp_commercial/whatsapp_commercial.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappCommercial,
      WhatsappMessage,
      WhatsappChat,
      PendingMessage,
      QueuePosition,
      WhapiChannel
    ]),
    DispatcherModule,
    WhatsappMessageModule,
    WhatsappChatModule,
    CommunicationWhapiModule,
    forwardRef(() => ChannelModule),
    WhatsappCommercialModule,
  ],
  controllers: [WhapiController],
  providers: [WhapiService, WhapiServiceDispacher],
})
export class WhapiModule {}