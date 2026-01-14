import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatcherService } from './dispatcher.service';
import { QueueService } from './services/queue.service';
import { PendingMessage } from './entities/pending-message.entity';
import { QueuePosition } from './entities/queue-position.entity';
import { WhatsappConversationModule } from '../whatsapp_conversation/whatsapp_conversation.module';
;
import { WhatsappCommercial } from 'src/users/entities/user.entity';
import { WhatsappCustomerModule } from 'src/whatsapp_customer/whatsapp_customer.module';
import { WhatsappCustomerService } from 'src/whatsapp_customer/whatsapp_customer.service';
import { WhatsappCustomer } from '../whatsapp_customer/entities/whatsapp_customer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PendingMessage, QueuePosition, WhatsappCommercial, WhatsappCustomer]),
    WhatsappConversationModule,
    WhatsappCustomerModule,

  ],
  controllers: [],
  providers: [DispatcherService, QueueService,WhatsappCustomerService],
  exports: [DispatcherService, QueueService],
})
export class DispatcherModule {}
