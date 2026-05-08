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

  onApplicationBootstrap(): void {
    this._run('bootstrap').catch((err) =>
      this.logger.error(`Erreur sync appels au démarrage: ${(err as Error).message}`),
    );
  }

  /** Sync DB2 → DB1 toutes les 30 secondes : mapping commerciaux puis appels. */
  @Cron('*/30 * * * * *')
  async run(): Promise<void> {
    if (this.running) {
      this.logger.debug('Sync DB2 déjà en cours — skip');
      return;
    }
    if (this.lockService) {
      const { acquired } = await this.lockService.tryWithLock(
        'cron:order-call-sync', 29_000,
        () => this._run(),
      );
      if (!acquired) { this.logger.debug('LOCK_SKIPPED cron:order-call-sync'); }
      return;
    }
    await this._run();
  }

  private async _run(triggeredBy: 'cron' | 'bootstrap' = 'cron'): Promise<void> {
    this.running = true;
    try {
      this.logger.log(`Sync DB2 démarrée (source: ${triggeredBy})`);
      await this.syncService.syncCommercialMapping();
      const result = await this.syncService.syncNewCalls();
      this.logger.log(
        `Sync DB2 terminée (source: ${triggeredBy}) — ${result.processed} appels, ${result.obligations} obligations, ${result.errors} erreurs`,
      );
    } catch (err) {
      this.logger.error(`Erreur sync DB2: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
