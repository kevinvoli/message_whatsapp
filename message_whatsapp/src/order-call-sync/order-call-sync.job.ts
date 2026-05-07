import { Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrderCallSyncService } from './order-call-sync.service';
import { DistributedLockService } from 'src/redis/distributed-lock.service';

@Injectable()
export class OrderCallSyncJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrderCallSyncJob.name);
  private running = false;
  
  constructor(
    private readonly syncService: OrderCallSyncService,
    @Optional() private readonly lockService: DistributedLockService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.syncService.syncCommercialMapping();
    } catch (err) {
      this.logger.error(`Erreur sync mapping au démarrage: ${(err as Error).message}`);
    }
  }

  /** Sync DB2 → DB1 toutes les 5 minutes : mapping commerciaux puis appels. */
  @Cron('*/5 * * * *')
  async run(): Promise<void> {
    if (this.running) {
      this.logger.debug('Sync DB2 déjà en cours — skip');
      return;
    }
    if (this.lockService) {
      const { acquired } = await this.lockService.tryWithLock(
        'cron:order-call-sync', 450_000,
        () => this._run(),
      );
      if (!acquired) { this.logger.debug('LOCK_SKIPPED cron:order-call-sync'); }
      return;
    }
    await this._run();
  }

  private async _run(): Promise<void> {
    this.running = true;
    try {
      await this.syncService.syncCommercialMapping();
      await this.syncService.syncNewCalls();
    } catch (err) {
      this.logger.error(`Erreur sync DB2: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
