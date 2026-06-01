import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialConversationAccess } from './entities/commercial-conversation-access.entity';
import { ConversationRestrictionService } from './conversation-restriction.service';
import {
  ConversationRestrictionAdminController,
  ConversationRestrictionCommercialController,
} from './conversation-restriction.controller';
import { SystemConfigModule } from 'src/system-config/system-config.module';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommercialConversationAccess,
      WhatsappChat,
      WhatsappMessage,
    ]),
    SystemConfigModule,
  ],
  controllers: [
    ConversationRestrictionCommercialController,
    ConversationRestrictionAdminController,
  ],
  providers: [ConversationRestrictionService],
  exports: [ConversationRestrictionService],
})
export class ConversationRestrictionModule {}
