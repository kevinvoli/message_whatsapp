import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueService } from './services/queue.service';
import { PendingMessage } from './entities/pending-message.entity';
import { QueuePosition } from './entities/queue-position.entity';
import { WhatsappMessageModule } from '../whatsapp_message/whatsapp_message.module';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { PendingMessageService } from './services/pending-message.service';
import { AssignmentService } from './services/assignment.service';
import { DispatcherOrchestrator } from './services/dispatcher-orchestrator.service';

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
    // New architecture
    AssignmentService,
    DispatcherOrchestrator,

    // Core services
    QueueService,
    PendingMessageService,
  ],
  exports: [DispatcherOrchestrator, QueueService],
})
export class DispatcherModule {}
