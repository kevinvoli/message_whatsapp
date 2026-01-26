import { forwardRef, Module } from '@nestjs/common';
import { WhatsappMessageService } from './whatsapp_message.service';
import { WhatsappMessageGateway } from './whatsapp_message.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessage } from './entities/whatsapp_message.entity';
import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappChatModule } from 'src/whatsapp_chat/whatsapp_chat.module';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { DispatcherModule } from 'src/dispatcher/dispatcher.module';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { FirstResponseTimeoutJob } from 'src/jorbs/first-response-timeout.job';
import { WhapiChannel } from 'src/channel/entities/channel.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappMessage,
      WhatsappChat,
      WhatsappMessageContent,
      WhatsappCommercial,
      QueuePosition,
      WhapiChannel,
    ]),
    WhatsappChatModule,
    forwardRef(() => DispatcherModule)
  ],
  providers: [
    WhatsappChatService,
    WhatsappMessageGateway,
    WhatsappMessageService,
    WhatsappCommercialService,
    CommunicationWhapiService,
    FirstResponseTimeoutJob
  ],
  exports: [WhatsappMessageGateway, WhatsappMessageService],
})
export class WhatsappMessageModule {}
