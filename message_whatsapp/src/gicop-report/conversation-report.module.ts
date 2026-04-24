import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationReport } from './entities/conversation-report.entity';
import { ConversationReportService } from './conversation-report.service';
import { ConversationReportController } from './conversation-report.controller';
import { ReportSubmissionService } from './report-submission.service';
import { OrderPlatformSyncService } from './order-platform-sync.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConversationReport, WhatsappCommercial])],
  controllers: [ConversationReportController],
  providers: [ConversationReportService, ReportSubmissionService, OrderPlatformSyncService],
  exports: [ConversationReportService, ReportSubmissionService],
})
export class ConversationReportModule {}
