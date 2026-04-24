import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { ClosureAttemptLog } from 'src/conversation-closure/entities/closure-attempt-log.entity';
import { ConversationReport } from 'src/gicop-report/entities/conversation-report.entity';
import { FollowUp } from 'src/follow-up/entities/follow_up.entity';
import { IntegrationSyncLogService } from 'src/integration-sync/integration-sync-log.service';
import { ORDER_DB_AVAILABLE } from 'src/order-db/order-db.constants';

export interface BusinessMetrics {
  period:               string;
  closuresBlocked24h:   number;
  reportsSubmitted24h:  number;
  reportsFailed:        number;
  remindersExecuted24h: number;
  syncLog:              Record<string, number>;
  db2Available:         boolean;
}

function since(hours: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d;
}

@Injectable()
export class BusinessMetricsService {
  constructor(
    @InjectRepository(ClosureAttemptLog)
    private readonly closureLogRepo: Repository<ClosureAttemptLog>,

    @InjectRepository(ConversationReport)
    private readonly reportRepo: Repository<ConversationReport>,

    @InjectRepository(FollowUp)
    private readonly followUpRepo: Repository<FollowUp>,

    private readonly syncLogService: IntegrationSyncLogService,

    @Inject(ORDER_DB_AVAILABLE)
    private readonly db2Available: boolean,
  ) {}

  async getMetrics(): Promise<BusinessMetrics> {
    const since24h = since(24);

    const [
      closuresBlocked24h,
      reportsSubmitted24h,
      reportsFailed,
      remindersExecuted24h,
      syncLog,
    ] = await Promise.all([
      this.closureLogRepo.count({
        where: { wasBlocked: 1, createdAt: MoreThan(since24h) },
      }),
      this.reportRepo.count({
        where: { submissionStatus: 'sent', submittedAt: MoreThan(since24h) },
      }),
      this.reportRepo.count({
        where: { submissionStatus: 'failed' },
      }),
      this.followUpRepo.count({
        where: { reminded_at: MoreThan(since24h) },
      }),
      this.syncLogService.countByStatus(),
    ]);

    return {
      period:               'last_24h',
      closuresBlocked24h,
      reportsSubmitted24h,
      reportsFailed,
      remindersExecuted24h,
      syncLog,
      db2Available:         this.db2Available,
    };
  }
}
