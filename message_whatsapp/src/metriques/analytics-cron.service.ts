import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AnalyticsSnapshotService } from './analytics-snapshot.service';

@Injectable()
export class AnalyticsCronService {
  private readonly logger = new Logger(AnalyticsCronService.name);

  constructor(private readonly snapshotService: AnalyticsSnapshotService) {}

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
