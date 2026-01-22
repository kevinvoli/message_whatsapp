import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatcherService } from './dispatcher.service';
import { QueueService } from './services/queue.service';
import { PendingMessage } from './entities/pending-message.entity';
import { QueuePosition } from './entities/queue-position.entity';
import { WhatsappMessageModule } from '../whatsapp_message/whatsapp_message.module';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChatModule } from 'src/whatsapp_chat/whatsapp_chat.module';
import { CommunicationWhapiModule } from 'src/communication_whapi/communication_whapi.module';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialModule } from 'src/whatsapp_commercial/whatsapp_commercial.module';
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
    WhatsappChatModule,
    CommunicationWhapiModule,
    WhatsappCommercialModule,
  ],
  controllers: [],
  providers: [
    DispatcherService,
    QueueService,
    PendingMessageService,
    ConversationRedispatchWorker,
    ConversationRedispatchCron,
  ],
  exports: [DispatcherService, QueueService],
})
export class DispatcherModule {}
