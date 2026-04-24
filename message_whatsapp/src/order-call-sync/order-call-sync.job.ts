import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrderCallSyncService } from './order-call-sync.service';

@Injectable()
export class OrderCallSyncJob {
  private readonly logger = new Logger(OrderCallSyncJob.name);
  private running = false;

  constructor(private readonly syncService: OrderCallSyncService) {}

  /** Lecture incrémentale des appels depuis DB2 toutes les 5 minutes. */
  @Cron('*/5 * * * *')
  async run(): Promise<void> {
    if (this.running) {
      this.logger.debug('Sync call_logs déjà en cours — skip');
      return;
    }
    this.running = true;
    try {
      await this.syncService.syncNewCalls();
    } catch (err) {
      this.logger.error(`Erreur sync call_logs: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
