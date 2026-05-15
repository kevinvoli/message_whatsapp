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
    // FIX-H7: Delai 5 min avant syncClientCategories au bootstrap
    // Evite d'ecraser des categories manuelles avec des donnees DB2 potentiellement en retard
    setTimeout(() =>
      this._runSyncClientCategories().catch((err) =>
        this.logger.error('Erreur syncClientCategories au démarrage: ' + (err as Error).message),
      ),
    5 * 60 * 1000, // 5 minutes
    );
    setImmediate(() =>
      this._runInitBatches().catch((err) =>
        this.logger.error(`Erreur initAllBatches au démarrage: ${(err as Error).message}`),
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

  /** FIX-C4 — Retry automatique call_event_unresolved toutes les 15 minutes. */
  @Cron('0 */15 * * * *')
  async retryUnresolved(): Promise<void> {
    if (this.running) return;
    if (this.lockService) {
      const { acquired } = await this.lockService.tryWithLock(
        'cron:retry-unresolved', 14_000 * 60,
        () => this.syncService.retryUnresolvedCalls(),
      );
      if (!acquired) this.logger.debug('LOCK_SKIPPED cron:retry-unresolved');
      return;
    }
    try {
      await this.syncService.retryUnresolvedCalls();
    } catch (e) {
      this.logger.error('retryUnresolved echoue', e);
    }
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
  /** FIX-H4 — Remet is_working_today a false sur tous les commerciaux a minuit. */
  @Cron('0 0 0 * * *')
  async resetWorkingToday(): Promise<void> {
    try {
      const result = await this.syncService.resetAllWorkingToday();
      this.logger.log('[Cron] resetWorkingToday: ' + result.affected + ' commerciaux remis a false');
    } catch (err) {
      this.logger.error('Erreur resetWorkingToday: ' + (err as Error).message);
    }
  }

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
      this.logger.log('[SyncLog] Purge : ' + deleted + ' entrées success supprimées (> 30j)');

      // FIX-M7: Débloquer les pending > 1h (processus crashé)
      const unblocked = await this.syncLog.unblockStuckPending(60);
      if (unblocked > 0) {
        this.logger.warn('[SyncLog] FIX-M7: ' + unblocked + ' entrées pending bloquées > 1h débloquées vers failed');
      }
    } catch (err) {
      this.logger.error('Erreur purgeOldSyncLogs: ' + (err as Error).message);
    }
  }

  /** FIX-H2 — Purge call_event_unresolved non-outgoing, dimanche a 5h. */
  @Cron('0 5 * * 0')
  async cleanNonOutgoingUnresolved(): Promise<void> {
    try {
      const result = await this.syncService.purgeNonOutgoingUnresolved();
      this.logger.log('[Cron] cleanNonOutgoingUnresolved: ' + result.deleted + ' lignes supprimees');
    } catch (err) {
      this.logger.error('Erreur cleanNonOutgoingUnresolved: ' + (err as Error).message);
    }
  }

  private async _runInitBatches(): Promise<void> {
    try {
      const result = await this.syncService.initAllBatches();
      if (result) {
        this.logger.log(`[Bootstrap] initAllBatches: ${result.created} créés, ${result.alreadyActive} déjà actifs`);
      }
    } catch (err) {
      this.logger.error(`Erreur initAllBatches: ${(err as Error).message}`);
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
