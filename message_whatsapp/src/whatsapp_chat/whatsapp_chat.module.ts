import { Module } from '@nestjs/common';
import { WhatsappChatService } from './whatsapp_chat.service';
import { WhatsappChatGateway } from './whatsapp_chat.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappChat } from './entities/whatsapp_chat.entity';
import { WhatsappChatLabel } from 'src/whatsapp_chat_label/entities/whatsapp_chat_label.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    WhatsappChat,WhatsappChatLabel,   WhatsappCommercial
      ])],
  providers: [WhatsappChatGateway, WhatsappChatService, WhatsappCommercialService],
})
export class WhatsappChatModule {}
