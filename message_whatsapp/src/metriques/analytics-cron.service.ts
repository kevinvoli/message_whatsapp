import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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

  /** Toutes les 10 minutes — recalcule les snapshots */
  @Cron('0 */10 * * * *')
  async refreshSnapshots(): Promise<void> {
    this.logger.debug('CRON_SNAPSHOT_REFRESH triggered');
    await this.snapshotService.computeAll();
  }

  /** Toutes les heures — purge les snapshots expirés */
  @Cron('0 0 * * * *')
  async purgeSnapshots(): Promise<void> {
    this.logger.debug('CRON_SNAPSHOT_PURGE triggered');
    await this.snapshotService.purgeExpired();
  }
}
