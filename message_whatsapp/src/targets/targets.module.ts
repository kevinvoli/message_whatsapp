import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialTarget } from './entities/commercial_target.entity';
import { CommercialDailyPerformance } from './entities/commercial-daily-performance.entity';
import { TargetsService } from './targets.service';
import { CommercialDailySnapshotService } from './commercial-daily-snapshot.service';
import { TargetsController } from './targets.controller';
import { WhatsappMessage } from '../whatsapp_message/entities/whatsapp_message.entity';
import { CallLog } from '../call-log/entities/call_log.entity';
import { FollowUp } from '../follow-up/entities/follow_up.entity';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';
import { SystemConfigModule } from '../system-config/system-config.module';
import { ConversationReport } from '../gicop-report/entities/conversation-report.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommercialTarget, CommercialDailyPerformance, WhatsappMessage, CallLog, FollowUp, WhatsappCommercial, ConversationReport]),
    SystemConfigModule,
  ],
  providers: [TargetsService, CommercialDailySnapshotService],
  controllers: [TargetsController],
  exports: [TargetsService, CommercialDailySnapshotService],
})
export class TargetsModule {}
