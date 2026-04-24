import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessMetricsService } from './business-metrics.service';
import { BusinessMetricsController } from './business-metrics.controller';
import { ClosureAttemptLog } from 'src/conversation-closure/entities/closure-attempt-log.entity';
import { ConversationReport } from 'src/gicop-report/entities/conversation-report.entity';
import { FollowUp } from 'src/follow-up/entities/follow_up.entity';
import { IntegrationSyncModule } from 'src/integration-sync/integration-sync.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClosureAttemptLog, ConversationReport, FollowUp]),
    IntegrationSyncModule,
  ],
  controllers: [BusinessMetricsController],
  providers:   [BusinessMetricsService],
})
export class BusinessMetricsModule {}
