import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { ConversationTransferService } from './conversation-transfer.service';
import {
  ConversationTransferController,
  ConversationTransferAdminController,
} from './conversation-transfer.controller';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappChat, WhatsappPoste]),
    WhatsappMessageModule,
  ],
  controllers: [
    ConversationTransferController,
    ConversationTransferAdminController,
  ],
  providers: [ConversationTransferService],
  exports: [ConversationTransferService],
})
export class ConversationTransferModule {}
