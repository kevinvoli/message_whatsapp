import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('webhook-purge', () =>
      this.purgeOldEvents(),
    );
    this.cronConfigService.registerPreviewHandler('webhook-purge', () =>
      this.previewPurge(),
    );
  }

  async previewPurge(): Promise<{ total: number; ttlDays: number; cutoffDate: string }> {
    const ttlDays = await this.getTtlDays();
    const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);
    try {
      const total = await this.webhookEventRepository.count({
        where: { createdAt: LessThan(cutoff) },
      });
      return { total, ttlDays, cutoffDate: cutoff.toISOString() };
    } catch {
      return { total: 0, ttlDays, cutoffDate: cutoff.toISOString() };
    }
  }

  async purgeOldEvents(): Promise<string> {
    const ttlDays = await this.getTtlDays();
    const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);

    try {
      const result = await this.webhookEventRepository.delete({
        createdAt: LessThan(cutoff),
      });
      const affected = typeof result.affected === 'number' ? result.affected : 0;
      if (affected > 0) {
        this.metricsService.recordIdempotencyPurge(affected);
        this.logger.log(
          `Idempotency purge removed=${affected} before=${cutoff.toISOString()}`,
        );
      }
      return `${affected} événement(s) webhook supprimé(s) (antérieurs au ${cutoff.toLocaleDateString('fr-FR')}, TTL ${ttlDays}j)`;
    } catch (error) {
      const code = (error as { driverError?: { code?: string } })?.driverError?.code;
      if (code === 'ER_NO_SUCH_TABLE') {
        this.logger.warn('Idempotency purge skipped: webhook_event_log missing');
        return 'Ignoré — table webhook_event_log absente';
      }
      this.logger.error('Idempotency purge failed', error as Error);
      throw error;
    }
  }

  private async getTtlDays(): Promise<number> {
    try {
      const config = await this.cronConfigService.findByKey('webhook-purge');
      if (config.ttlDays && config.ttlDays > 0) return config.ttlDays;
    } catch {}
    const raw = process.env.WEBHOOK_IDEMPOTENCY_TTL_DAYS;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
  }
}
