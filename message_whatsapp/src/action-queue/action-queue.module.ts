import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialActionTask } from './entities/commercial-action-task.entity';
import { ActionQueueService } from './action-queue.service';
import { ActionQueueController } from './action-queue.controller';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommercialActionTask, WhatsappChat, WhatsappMessage, WhatsappCommercial]),
  ],
  controllers: [ActionQueueController],
  providers: [ActionQueueService],
  exports: [ActionQueueService],
})
export class ActionQueueModule {}
