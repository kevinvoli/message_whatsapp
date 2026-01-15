import { Module } from '@nestjs/common';
import { WhatsappChatService } from './whatsapp_chat.service';
import { WhatsappChatGateway } from './whatsapp_chat.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappChat } from './entities/whatsapp_chat.entity';
import { WhatsappChatLabel } from 'src/whatsapp_chat_label/entities/whatsapp_chat_label.entity';
import { UsersService } from 'src/users/users.service';
import { WhatsappCommercial } from 'src/users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    WhatsappChat,WhatsappChatLabel,   WhatsappCommercial
      ])],
  providers: [WhatsappChatGateway, WhatsappChatService, UsersService],
})
export class WhatsappChatModule {}
