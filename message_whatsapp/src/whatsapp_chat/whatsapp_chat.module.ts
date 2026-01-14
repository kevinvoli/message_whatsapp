import { Module } from '@nestjs/common';
import { WhatsappChatService } from './whatsapp_chat.service';
import { WhatsappChatGateway } from './whatsapp_chat.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappChat } from './entities/whatsapp_chat.entity';
import { WhatsappChatEvent } from 'src/whatsapp_chat_event/entities/whatsapp_chat_event.entity';
import { WhatsappConversation } from 'src/whatsapp_conversation/entities/whatsapp_conversation.entity';
import { WhatsappChatLabel } from 'src/whatsapp_chat_label/entities/whatsapp_chat_label.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    WhatsappChat,WhatsappChatLabel,WhatsappConversation , WhatsappChatEvent, WhatsappCommercial
      ])],
  providers: [WhatsappChatGateway, WhatsappChatService, WhatsappCommercialService],
})
export class WhatsappChatModule {}
