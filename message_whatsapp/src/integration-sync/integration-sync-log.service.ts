import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import {
  IntegrationSyncLog,
  SyncEntityType,
} from './entities/integration-sync-log.entity';

@Injectable()
export class IntegrationSyncLogService {
  private readonly logger = new Logger(IntegrationSyncLogService.name);

  constructor(
    @InjectRepository(IntegrationSyncLog)
    private readonly repo: Repository<IntegrationSyncLog>,
  ) {}

  async createPending(
    entityType: SyncEntityType,
    entityId: string,
    targetTable: string,
  ): Promise<IntegrationSyncLog> {
    return this.repo.save(
      this.repo.create({ entityType, entityId, targetTable, status: 'pending' }),
    );
  }

  async markSuccess(id: string): Promise<void> {
    await this.repo.update(id, {
      status:       'success',
      syncedAt:     new Date(),
      lastError:    null,
    });
  }

  async markFailed(id: string, error: string, isBusinessRejection = false): Promise<void> {
    const log = await this.repo.findOne({ where: { id } });
    if (!log) return;
    await this.repo.update(id, {
      status:              'failed',
      lastError:           error.slice(0, 2000),
      attemptCount:        log.attemptCount + 1,
      isBusinessRejection,
    });
  }

  async incrementAttempt(id: string, error: string): Promise<void> {
    return this.markFailed(id, error);
  }

  findFailed(limit = 50): Promise<IntegrationSyncLog[]> {
    return this.repo.find({
      where:  { status: 'failed' },
      order:  { createdAt: 'DESC' },
      take:   limit,
    });
  }

  findPending(limit = 100): Promise<IntegrationSyncLog[]> {
    return this.repo.find({
      where:  { status: 'pending' },
      order:  { createdAt: 'ASC' },
      take:   limit,
    });
  }

  /** Compte les entrées en échec par type d'entité. */
  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.repo
      .createQueryBuilder('l')
      .select('l.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('l.status')
      .getRawMany<{ status: string; count: string }>();
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  }

  /** Vérifie si une entité a déjà été synchronisée avec succès (déduplication). */
  async existsForEntity(entityType: SyncEntityType, entityId: string): Promise<boolean> {
    const count = await this.repo.count({
      where: { entityType, entityId, status: 'success' },
    });
    return count > 0;
  }

  /**
   * Vérifie si une entrée existe pour cette entité, quel que soit son statut.
   * Utilisé pour éviter de créer des doublons lors de re-fetch dans la fenêtre de lookback.
   */
  async existsAnyForEntity(entityType: SyncEntityType, entityId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { entityType, entityId } });
    return count > 0;
  }

  /**
   * Version bulk de existsAnyForEntity — une seule requête SQL pour N entity_ids.
   * Retourne le Set des entityId déjà présents dans la table (tout statut confondu).
   */
  async existsAnyInBatch(entityType: SyncEntityType, entityIds: string[]): Promise<Set<string>> {
    if (entityIds.length === 0) return new Set();
    const rows = await this.repo
      .createQueryBuilder('l')
      .select('l.entityId', 'entityId')
      .where('l.entityType = :entityType', { entityType })
      .andWhere('l.entityId IN (:...entityIds)', { entityIds })
      .getRawMany<{ entityId: string }>();
    return new Set(rows.map((r) => r.entityId));
  }

  /**
   * Supprime les entrées pending en doublon : garde la plus récente par entity_id,
   * supprime toutes les autres pending pour le même entity_type + entity_id.
   * Retourne le nombre de lignes supprimées.
   */
  async purgeStuckPending(entityType: SyncEntityType): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where(
        `status = 'pending'
         AND entity_type = :entityType
         AND id NOT IN (
           SELECT keep_id FROM (
             SELECT MAX(id) AS keep_id
             FROM integration_sync_log
             WHERE status = 'pending' AND entity_type = :entityType
             GROUP BY entity_id
           ) AS t
         )`,
        { entityType },
      )
      .execute();
    const deleted = result.affected ?? 0;
    if (deleted > 0) {
      this.logger.log(`purgeStuckPending(${entityType}): ${deleted} doublons supprimés`);
    }
    return deleted;
  }

  /** Purge les entrées success de plus de N jours. */
  async purgeOldSuccess(days = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const result = await this.repo.delete({
      status:    'success',
      createdAt: LessThan(cutoff),
    });
    const count = result.affected ?? 0;
    if (count > 0) this.logger.log(`Purge sync log: ${count} entrée(s) supprimée(s)`);
    return count;
  }

  /**
   * FIX-M7: Débloque les entrées pending > 1h (processus crashé).
   * Passe leur statut a failed pour libérer le pipeline de retry.
   * Appelé par purgeOldSyncLogs() dans le cron hebdomadaire.
   */
  async unblockStuckPending(maxAgeMinutes = 60): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    const result = await this.repo
      .createQueryBuilder()
      .update(IntegrationSyncLog)
      .set({ status: 'failed', lastError: 'auto-unblocked: stuck pending > ' + maxAgeMinutes + 'min' })
      .where('status = :status AND created_at < :cutoff', { status: 'pending', cutoff })
      .execute();
    const unblocked = result.affected ?? 0;
    if (unblocked > 0) {
      this.logger.warn('FIX-M7 Deblocage ' + unblocked + ' integration_sync_log pending bloques > ' + maxAgeMinutes + 'min');
    }
    return unblocked;
  }
}
