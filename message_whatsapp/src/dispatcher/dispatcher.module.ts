import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatcherService } from './dispatcher.service';
import { QueueService } from './services/queue.service';
import { PendingMessage } from './entities/pending-message.entity';
import { QueuePosition } from './entities/queue-position.entity';
import { WhatsappMessageModule } from '../whatsapp_message/whatsapp_message.module';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ChannelService } from 'src/channel/channel.service';
import { ContactService } from 'src/contact/contact.service';
import { Contact } from 'src/contact/entities/contact.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PendingMessage, QueuePosition, WhatsappMessage, WhatsappChat,  WhatsappCommercial,WhapiChannel, Contact]),
    forwardRef(() => WhatsappMessageModule),
  ],
  controllers: [],
  providers: [DispatcherService ,QueueService,WhatsappMessageService,WhatsappChatService,CommunicationWhapiService,WhatsappCommercialService,ChannelService,ContactService],
  exports: [DispatcherService, QueueService,],
})
export class DispatcherModule {}
