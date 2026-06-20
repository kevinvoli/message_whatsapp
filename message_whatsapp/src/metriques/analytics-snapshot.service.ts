import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AnalyticsSnapshot } from './entities/analytics-snapshot.entity';
import { MetriquesService } from './metriques.service';

const STANDARD_PERIODS = ['today', 'week', 'month', 'year'] as const;

@Injectable()
export class AnalyticsSnapshotService {
  private readonly logger = new Logger(AnalyticsSnapshotService.name);
  // In-process lock : si plusieurs admins chargent simultanément un snapshot expiré,
  // un seul recalcul est lancé — les autres attendent le même Promise.
  private readonly computingLocks = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(AnalyticsSnapshot)
    private readonly snapshotRepository: Repository<AnalyticsSnapshot>,
    private readonly metriquesService: MetriquesService,
  ) {}

  /**
   * Calcule et stocke les snapshots pour toutes les périodes standard.
   */
  async computeAll(): Promise<void> {
    const start = Date.now();
    this.logger.log('SNAPSHOT_COMPUTE_START');

    for (const periode of STANDARD_PERIODS) {
      try {
        const [metriques, performanceCommercial, statutChannels, performanceTemporelle] =
          await Promise.all([
            this.metriquesService.getMetriquesGlobales(periode),
            this.metriquesService.getPerformanceCommerciaux(periode),
            this.metriquesService.getStatutChannels(periode),
            this.metriquesService.getPerformanceTemporelle(
              { today: 1, week: 7, month: 30, year: 365 }[periode] ?? 7,
            ),
          ]);

        const snapshot = this.snapshotRepository.create({
          scope: 'global',
          scope_id: periode,
          date_start: null,
          date_end: null,
          ttl_seconds: 720,
          data: { metriques, performanceCommercial, statutChannels, performanceTemporelle },
        });

        await this.snapshotRepository.save(snapshot);
        this.logger.debug(`SNAPSHOT_COMPUTED scope=global period=${periode}`);
      } catch (err) {
        this.logger.error(
          `SNAPSHOT_COMPUTE_ERROR period=${periode}`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }

    this.logger.log(`SNAPSHOT_COMPUTE_DONE elapsed=${Date.now() - start}ms`);
  }


  /**
   * Retourne le dernier snapshot brut (sans vérification TTL) — pour diagnostic.
   */
  async getRaw(scope: string, scope_id?: string): Promise<AnalyticsSnapshot | null> {
    return this.snapshotRepository.findOne({
      where: { scope: scope as any, ...(scope_id !== undefined ? { scope_id } : {}) },
      order: { computed_at: 'DESC' },
    });
  }

  /**
   * Retourne le dernier snapshot valide (non expiré) pour le scope/scope_id donnés.
   */
  async getLatest(scope: string, scope_id?: string): Promise<AnalyticsSnapshot | null> {
    const snapshot = await this.snapshotRepository.findOne({
      where: { scope: scope as any, ...(scope_id !== undefined ? { scope_id } : {}) },
      order: { computed_at: 'DESC' },
    });

    if (!snapshot) return null;

    const ageSeconds = (Date.now() - new Date(snapshot.computed_at).getTime()) / 1000;
    if (ageSeconds > snapshot.ttl_seconds) return null;

    return snapshot;
  }

  /**
   * Retourne le snapshot valide ou déclenche un recalcul si expiré.
   * Protège contre le thundering herd : si plusieurs requêtes arrivent
   * simultanément sur un snapshot expiré, un seul recalcul est lancé.
   */
  async getLatestOrCompute(scope: string, periode: string): Promise<AnalyticsSnapshot | null> {
    const existing = await this.getLatest(scope, periode);
    if (existing) return existing;

    await this.computeForPeriode(periode);

    return this.snapshotRepository.findOne({
      where: { scope: scope as any, scope_id: periode },
      order: { computed_at: 'DESC' },
    });
  }

  /**
   * Recalcule le snapshot pour une période donnée avec lock in-process.
   */
  async computeForPeriode(periode: string): Promise<void> {
    const lockKey = `global:${periode}`;

    if (this.computingLocks.has(lockKey)) {
      return this.computingLocks.get(lockKey);
    }

    const promise = this._doCompute(periode).finally(() => {
      this.computingLocks.delete(lockKey);
    });

    this.computingLocks.set(lockKey, promise);
    return promise;
  }

  private async _doCompute(periode: string): Promise<void> {
    const joursMap: Record<string, number> = { today: 1, week: 7, month: 30, year: 365 };
    const [metriques, performanceCommercial, statutChannels, performanceTemporelle] =
      await Promise.all([
        this.metriquesService.getMetriquesGlobales(periode),
        this.metriquesService.getPerformanceCommerciaux(periode),
        this.metriquesService.getStatutChannels(periode),
        this.metriquesService.getPerformanceTemporelle(joursMap[periode] ?? 7),
      ]);

    const snapshot = this.snapshotRepository.create({
      scope: 'global',
      scope_id: periode,
      date_start: null,
      date_end: null,
      ttl_seconds: 720,
      data: { metriques, performanceCommercial, statutChannels, performanceTemporelle },
    });

    await this.snapshotRepository.save(snapshot);
    this.logger.debug(`SNAPSHOT_COMPUTED scope=global period=${periode}`);
  }

  /**
   * Supprime les snapshots dont le TTL est expiré.
   */
  async purgeExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - 3600 * 1000); // garde 1h max
    const result = await this.snapshotRepository.delete({
      computed_at: LessThan(cutoff),
    });
    if ((result.affected ?? 0) > 0) {
      this.logger.log(`SNAPSHOT_PURGED count=${result.affected}`);
    }
  }
}
