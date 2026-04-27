import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { ConversationReport } from 'src/gicop-report/entities/conversation-report.entity';
import { FollowUp } from 'src/follow-up/entities/follow_up.entity';
import { CallObligationModule } from 'src/call-obligations/call-obligation.module';
import { WorkAttendanceModule } from 'src/work-attendance/work-attendance.module';
import { CommercialActionGateService } from './commercial-action-gate.service';
import { CommercialActionGateController } from './commercial-action-gate.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappCommercial, WhatsappChat, WhatsappMessage, ConversationReport, FollowUp]),
    CallObligationModule,
    WorkAttendanceModule,
  ],
  controllers: [CommercialActionGateController],
  providers: [CommercialActionGateService],
  exports: [CommercialActionGateService],
})
export class CommercialActionGateModule {}
