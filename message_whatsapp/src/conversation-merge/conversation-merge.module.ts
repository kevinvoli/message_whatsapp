import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { ConversationMergeService } from './conversation-merge.service';
import {
  ConversationMergeAdminController,
  ConversationMergeController,
} from './conversation-merge.controller';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappChat, WhatsappMessage, WhatsappMedia]),
    WhatsappMessageModule,
  ],
  controllers: [ConversationMergeAdminController, ConversationMergeController],
  providers: [ConversationMergeService],
  exports: [ConversationMergeService],
})
export class ConversationMergeModule {}
