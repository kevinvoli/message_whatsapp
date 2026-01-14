import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatcherService } from './dispatcher.service';
import { QueueService } from './services/queue.service';
import { PendingMessage } from './entities/pending-message.entity';
import { QueuePosition } from './entities/queue-position.entity';
import { WhatsappConversationModule } from '../whatsapp_conversation/whatsapp_conversation.module';
import { WhatsappCommercialModule } from '../users/users.module';
import { WhatsappMessageModule } from '../whatsapp_message/whatsapp_message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PendingMessage, QueuePosition]),
    WhatsappConversationModule,
    WhatsappCommercialModule,
    forwardRef(() => WhatsappMessageModule),
  ],
  controllers: [],
  providers: [DispatcherService, QueueService],
  exports: [DispatcherService, QueueService],
})
export class DispatcherModule {}
