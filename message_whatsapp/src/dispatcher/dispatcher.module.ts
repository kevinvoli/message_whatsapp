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
import { PendingMessageService } from './services/pending-message.service';
import { ConversationRedispatchCron } from './workers/conversation-redispatch.cron';
import { ConversationRedispatchWorker } from './services/ConversationRedispatchWorker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PendingMessage,
      QueuePosition,
      WhatsappMessage,
      WhatsappChat,
      WhatsappCommercial,
    ]),
    forwardRef(() => WhatsappMessageModule),
  ],
  controllers: [],
  providers: [
    DispatcherService,
    QueueService,
    WhatsappMessageService,
    WhatsappChatService,
    CommunicationWhapiService,
    WhatsappCommercialService,
    PendingMessageService,
      ConversationRedispatchWorker,
    ConversationRedispatchCron,
  ],
  exports: [DispatcherService, QueueService],
})
export class DispatcherModule {}
