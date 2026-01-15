import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatcherService } from './dispatcher.service';
import { QueueService } from './services/queue.service';
import { PendingMessage } from './entities/pending-message.entity';
import { QueuePosition } from './entities/queue-position.entity';
import { WhatsappMessageModule } from '../whatsapp_message/whatsapp_message.module';
import { WhatsappCommercial } from 'src/users/entities/user.entity';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { UsersService } from 'src/users/users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PendingMessage, QueuePosition, WhatsappCommercial, WhatsappMessage, WhatsappChat]),
    forwardRef(() => WhatsappMessageModule),
  ],
  controllers: [],
  providers: [DispatcherService,UsersService ,QueueService,WhatsappMessageService,WhatsappChatService,CommunicationWhapiService,],
  exports: [DispatcherService, QueueService],
})
export class DispatcherModule {}
