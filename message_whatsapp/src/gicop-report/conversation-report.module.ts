import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationReport } from './entities/conversation-report.entity';
import { ConversationReportService } from './conversation-report.service';
import { ConversationReportController } from './conversation-report.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ConversationReport])],
  controllers: [ConversationReportController],
  providers: [ConversationReportService],
  exports: [ConversationReportService],
})
export class ConversationReportModule {}
