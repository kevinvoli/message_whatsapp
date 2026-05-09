import { Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrderCallSyncService } from './order-call-sync.service';
import { DistributedLockService } from 'src/redis/distributed-lock.service';
import { IntegrationSyncLogService } from 'src/integration-sync/integration-sync-log.service';

@Injectable()
export class OrderCallSyncJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrderCallSyncJob.name);
  private running = false;
  
  constructor(
    private readonly syncService: OrderCallSyncService,
    @Optional() private readonly lockService: DistributedLockService,
    private readonly syncLog: IntegrationSyncLogService,
  ) {}

  onApplicationBootstrap(): void {
    this._run('bootstrap').catch((err) =>
      this.logger.error(`Erreur sync appels au démarrage: ${(err as Error).message}`),
    );
    // Synchronise les catégories clients dès le démarrage (pas d'attente du cron 2h)
    setImmediate(() =>
      this._runSyncClientCategories().catch((err) =>
        this.logger.error(`Erreur syncClientCategories au démarrage: ${(err as Error).message}`),
      ),
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

  /** Retry obligations toutes les 5 min pour couvrir les appels historiques. */
  @Cron('0 */5 * * * *')
  async retryObligations(): Promise<void> {
    if (this.lockService) {
      const { acquired } = await this.lockService.tryWithLock(
        'cron:retry-obligations', 270_000,
        () => this._runRetry(),
      );
      if (!acquired) this.logger.debug('LOCK_SKIPPED cron:retry-obligations');
      return;
    }
    await this._runRetry();
  }

  /** N4 — Synchronisation client_category depuis DB2, tous les jours à 2h. */
  @Cron('0 2 * * *')
  async syncClientCategories(): Promise<void> {
    if (this.lockService) {
      const { acquired } = await this.lockService.tryWithLock(
        'cron:sync-client-categories', 3_600_000,
        () => this._runSyncClientCategories(),
      );
      if (!acquired) this.logger.debug('LOCK_SKIPPED cron:sync-client-categories');
      return;
    }
    await this._runSyncClientCategories();
  }

  /** N6 — Nettoyage des mappings orphelins (contact/commercial supprimés), dimanche à 3h. */
  @Cron('0 3 * * 0')
  async cleanOrphans(): Promise<void> {
    try {
      const result = await this.syncService.cleanOrphanMappings();
      this.logger.log(`[Cron] cleanOrphans: ${result.clients} clients, ${result.commercials} commerciaux`);
    } catch (err) {
      this.logger.error(`Erreur cleanOrphans: ${(err as Error).message}`);
    }
  }

  /** N9 — Purge des entrées sync_log success de plus de 30j, dimanche à 4h. */
  @Cron('0 4 * * 0')
  async purgeOldSyncLogs(): Promise<void> {
    try {
      const deleted = await this.syncLog.purgeOldSuccess(30);
      this.logger.log(`[SyncLog] Purge : ${deleted} entrées success supprimées (> 30j)`);
    } catch (err) {
      this.logger.error(`Erreur purgeOldSyncLogs: ${(err as Error).message}`);
    }
  }

  private async _runSyncClientCategories(): Promise<void> {
    try {
      const result = await this.syncService.syncClientCategories();
      this.logger.log(
        `[SyncCategories] ${result.updated} mis à jour, ${result.skipped} skippés, ${result.errors} erreurs`,
      );
    } catch (err) {
      this.logger.error(`Erreur syncClientCategories: ${(err as Error).message}`);
    }
  }

  private async _runRetry(): Promise<void> {
    try {
      await this.syncService.retryUnmatchedObligations();
    } catch (err) {
      this.logger.error(`Erreur retryObligations: ${(err as Error).message}`);
    }
  }

  private async _run(triggeredBy: 'cron' | 'bootstrap' = 'cron'): Promise<void> {
    this.running = true;
    try {
      this.logger.log(`Sync DB2 démarrée (source: ${triggeredBy})`);
      await this.syncService.syncCommercialMapping();
      await this.syncService.syncClientMapping();
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
