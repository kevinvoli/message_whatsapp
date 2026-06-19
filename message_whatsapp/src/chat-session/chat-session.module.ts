import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatSession } from './entities/chat-session.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ChatSessionService } from './chat-session.service';
import { CronConfig } from 'src/jorbs/entities/cron-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatSession, WhatsappChat, CronConfig])],
  providers: [ChatSessionService],
  exports: [ChatSessionService],
})
export class ChatSessionModule {}
