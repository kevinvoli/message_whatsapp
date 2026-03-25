import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { WebhookEventLog } from './entities/webhook-event.entity';
import { WebhookMetricsService } from './webhook-metrics.service';
import { CronConfigService } from 'src/jorbs/cron-config.service';

@Injectable()
export class WebhookIdempotencyPurgeService implements OnModuleInit {
  private readonly logger = new Logger(WebhookIdempotencyPurgeService.name);

  constructor(
    @InjectRepository(WebhookEventLog)
    private readonly webhookEventRepository: Repository<WebhookEventLog>,
    private readonly metricsService: WebhookMetricsService,
    private readonly cronConfigService: CronConfigService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('webhook-purge', () =>
      this.purgeOldEvents(),
    );
  }

  async purgeOldEvents(): Promise<void> {
    const ttlDays = await this.getTtlDays();
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
      const code = error?.driverError?.code;
      if (code === 'ER_NO_SUCH_TABLE') {
        this.logger.warn(
          'Idempotency purge skipped: webhook_event_log missing',
        );
        return;
      }
      this.logger.error('Idempotency purge failed', error as Error);
    }
  }

  private async getTtlDays(): Promise<number> {
    try {
      const config = await this.cronConfigService.findByKey('webhook-purge');
      if (config.ttlDays && config.ttlDays > 0) return config.ttlDays;
    } catch {}
    const raw = this.configService.get<string>('WEBHOOK_IDEMPOTENCY_TTL_DAYS');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
  }
}
