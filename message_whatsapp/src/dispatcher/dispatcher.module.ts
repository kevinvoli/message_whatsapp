import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatcherOrchestrator } from './orchestrator/dispatcher.orchestrator';
import { AssignmentService } from './services/assignment/assignment.service';
import { PendingMessageService } from './services/pending/pending-message.service';
import { QueueService } from './services/queue/queue.service';
import { PendingMessage } from './entities/pending-message.entity';
import { QueuePosition } from './entities/queue-position.entity';
import { WhatsappMessageModule } from '../whatsapp_message/whatsapp_message.module';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PendingMessage,
      QueuePosition,
      WhatsappChat,
      WhatsappCommercial,
    ]),
    forwardRef(() => WhatsappMessageModule),
  ],
  controllers: [],
  providers: [
    DispatcherOrchestrator,
    AssignmentService,
    PendingMessageService,
    QueueService,
  ],
  exports: [DispatcherOrchestrator, QueueService],
})
export class DispatcherModule {}
