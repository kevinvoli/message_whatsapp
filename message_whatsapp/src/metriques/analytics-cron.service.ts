import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AnalyticsSnapshotService } from './analytics-snapshot.service';

@Injectable()
export class AnalyticsCronService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsCronService.name);

  constructor(private readonly snapshotService: AnalyticsSnapshotService) {}

  /** Au démarrage — pré-chauffe les snapshots pour éviter la première requête lente */
  async onModuleInit(): Promise<void> {
    this.logger.log('SNAPSHOT_WARMUP_START');
    await this.snapshotService.computeAll();
    this.logger.log('SNAPSHOT_WARMUP_DONE');
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
