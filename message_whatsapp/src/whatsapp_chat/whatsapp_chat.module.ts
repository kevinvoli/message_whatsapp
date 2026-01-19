import { Module } from '@nestjs/common';
import { WhatsappChatService } from './whatsapp_chat.service';
import { WhatsappChatGateway } from './whatsapp_chat.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappChat } from './entities/whatsapp_chat.entity';
import { WhatsappChatEvent } from 'src/whatsapp_chat_event/entities/whatsapp_chat_event.entity';
import { WhatsappConversation } from 'src/whatsapp_conversation/entities/whatsapp_conversation.entity';
import { WhatsappChatLabel } from 'src/whatsapp_chat_label/entities/whatsapp_chat_label.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialModule } from 'src/whatsapp_commercial/whatsapp_commercial.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappChat,
      WhatsappChatLabel,
      WhatsappConversation,
      WhatsappChatEvent,
      WhatsappCommercial,
    ]),
    WhatsappCommercialModule,
  ],
  providers: [WhatsappChatGateway, WhatsappChatService],
  exports: [WhatsappChatService],
})
export class WhatsappChatModule {}
