import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationReport } from './entities/conversation-report.entity';
import { ConversationReportService } from './conversation-report.service';
import { ConversationReportController } from './conversation-report.controller';
import { ReportSubmissionService } from './report-submission.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { OrderWriteModule } from 'src/order-write/order-write.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationReport, WhatsappCommercial]),
    OrderWriteModule,
  ],
  controllers: [ConversationReportController],
  providers: [ConversationReportService, ReportSubmissionService],
  exports: [ConversationReportService, ReportSubmissionService],
})
export class ConversationReportModule {}
