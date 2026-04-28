import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationReport } from './entities/conversation-report.entity';
import { ConversationReportService } from './conversation-report.service';
import { ConversationReportController } from './conversation-report.controller';
import { ReportSubmissionService } from './report-submission.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { ContactPhone } from 'src/client-dossier/entities/contact-phone.entity';
import { ClientDossier } from 'src/client-dossier/entities/client-dossier.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { OrderWriteModule } from 'src/order-write/order-write.module';
import { ReportClosureMirrorListener } from './listeners/report-closure-mirror.listener';
import { IntegrationOutboxModule } from 'src/integration-outbox/integration-outbox.module';
import { NotificationModule } from 'src/notification/notification.module';
import { OutboxProcessorService } from './outbox-processor.service';
import { OutboxAlertService } from './outbox-alert.service';
import { FollowUpModule } from 'src/follow-up/follow_up.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationReport, WhatsappCommercial, Contact, ContactPhone, ClientDossier, WhatsappChat]),
    OrderWriteModule,
    IntegrationOutboxModule,
    NotificationModule,
    FollowUpModule,
  ],
  controllers: [ConversationReportController],
  providers: [ConversationReportService, ReportSubmissionService, ReportClosureMirrorListener, OutboxProcessorService, OutboxAlertService],
  exports: [ConversationReportService, ReportSubmissionService],
})
export class ConversationReportModule {}
