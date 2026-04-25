import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ConversationReport } from 'src/gicop-report/entities/conversation-report.entity';
import { ClosureAttemptLog } from './entities/closure-attempt-log.entity';
import { ConversationClosureService } from './conversation-closure.service';
import { ConversationClosureController } from './conversation-closure.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappChat, ConversationReport, ClosureAttemptLog]),
  ],
  controllers: [ConversationClosureController],
  providers: [ConversationClosureService],
  exports: [ConversationClosureService],
})
export class ConversationClosureModule {}
