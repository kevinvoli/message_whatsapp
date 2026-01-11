import { Module } from '@nestjs/common';
import { WhatsappChatEventService } from './whatsapp_chat_event.service';
import { WhatsappChatEventGateway } from './whatsapp_chat_event.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappChatEvent } from './entities/whatsapp_chat_event.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    WhatsappChatEvent,WhatsappChat
      ])],
  providers: [WhatsappChatEventGateway, WhatsappChatEventService],
})
export class WhatsappChatEventModule {}
