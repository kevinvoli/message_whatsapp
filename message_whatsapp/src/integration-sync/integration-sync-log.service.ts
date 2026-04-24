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

  async markFailed(id: string, error: string): Promise<void> {
    const log = await this.repo.findOne({ where: { id } });
    if (!log) return;
    await this.repo.update(id, {
      status:       'failed',
      lastError:    error.slice(0, 2000),
      attemptCount: log.attemptCount + 1,
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
}
