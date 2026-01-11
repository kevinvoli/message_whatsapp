import { Module } from '@nestjs/common';
import { WhatsappChatLabelService } from './whatsapp_chat_label.service';
import { WhatsappChatLabelGateway } from './whatsapp_chat_label.gateway';
import { WhatsappChatLabel } from './entities/whatsapp_chat_label.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
        WhatsappChatLabel,WhatsappChat
      ])],
  providers: [WhatsappChatLabelGateway, WhatsappChatLabelService],
})
export class WhatsappChatLabelModule {}
