import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationReport } from './entities/conversation-report.entity';
import { ConversationReportService } from './conversation-report.service';
import { ConversationReportController } from './conversation-report.controller';
import { ReportSubmissionService } from './report-submission.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { OrderWriteModule } from 'src/order-write/order-write.module';
import { ReportClosureMirrorListener } from './listeners/report-closure-mirror.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationReport, WhatsappCommercial, Contact]),
    OrderWriteModule,
  ],
  controllers: [ConversationReportController],
  providers: [ConversationReportService, ReportSubmissionService, ReportClosureMirrorListener],
  exports: [ConversationReportService, ReportSubmissionService],
})
export class ConversationReportModule {}
