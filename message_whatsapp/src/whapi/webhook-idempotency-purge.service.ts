import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { WebhookEventLog } from './entities/webhook-event.entity';
import { WebhookMetricsService } from './webhook-metrics.service';

@Injectable()
export class WebhookIdempotencyPurgeService {
  private readonly logger = new Logger(WebhookIdempotencyPurgeService.name);

  constructor(
    @InjectRepository(WebhookEventLog)
    private readonly webhookEventRepository: Repository<WebhookEventLog>,
    private readonly metricsService: WebhookMetricsService,
  ) {}

  @Cron('0 3 * * *')
  async purgeOldEvents(): Promise<void> {
    const ttlDays = this.getTtlDays();
    const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);

    try {
      const result = await this.webhookEventRepository.delete({
        createdAt: LessThan(cutoff),
      });
      if (typeof result.affected === 'number' && result.affected > 0) {
        this.metricsService.recordIdempotencyPurge(result.affected);
        this.logger.log(
          `Idempotency purge removed=${result.affected} before=${cutoff.toISOString()}`,
        );
      }
    } catch (error) {
      const code = (error as any)?.driverError?.code;
      if (code === 'ER_NO_SUCH_TABLE') {
        this.logger.warn('Idempotency purge skipped: webhook_event_log missing');
        return;
      }
      this.logger.error('Idempotency purge failed', error as Error);
    }
  }

  private getTtlDays(): number {
    const raw = process.env.WEBHOOK_IDEMPOTENCY_TTL_DAYS;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return 14;
  }
}
