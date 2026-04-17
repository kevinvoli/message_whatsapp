import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ConversationTransferService } from './conversation-transfer.service';
import {
  ConversationTransferController,
  ConversationTransferAdminController,
  OutboundConversationController,
} from './conversation-transfer.controller';
import { OutboundConversationService } from './outbound-conversation.service';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappChat, WhatsappPoste, WhapiChannel]),
    WhatsappMessageModule,
  ],
  controllers: [
    ConversationTransferController,
    ConversationTransferAdminController,
    OutboundConversationController,
  ],
  providers: [ConversationTransferService, OutboundConversationService],
  exports: [ConversationTransferService],
})
export class ConversationTransferModule {}
