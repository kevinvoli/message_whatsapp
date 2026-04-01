import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AnalyticsSnapshotService } from './analytics-snapshot.service';

@Injectable()
export class AnalyticsCronService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsCronService.name);

  constructor(private readonly snapshotService: AnalyticsSnapshotService) {}

  /** Au démarrage — pré-chauffe les snapshots en arrière-plan (non-bloquant) */
  onModuleInit(): void {
    this.logger.log('SNAPSHOT_WARMUP_START');
    this.snapshotService.computeAll()
      .then(() => this.logger.log('SNAPSHOT_WARMUP_DONE'))
      .catch((err) => this.logger.error('SNAPSHOT_WARMUP_ERROR', err instanceof Error ? err.stack : undefined));
  }

  /** Désactivé — recalcul des snapshots toutes les 10 min (trop lourd en CPU) */
  // @Cron('0 */10 * * * *')
  async refreshSnapshots(): Promise<void> {
    this.logger.debug('CRON_SNAPSHOT_REFRESH triggered');
    await this.snapshotService.computeAll();
  }

  /** Désactivé — purge des snapshots expirés toutes les heures */
  // @Cron('0 0 * * * *')
  async purgeSnapshots(): Promise<void> {
    this.logger.debug('CRON_SNAPSHOT_PURGE triggered');
    await this.snapshotService.purgeExpired();
  }
}
