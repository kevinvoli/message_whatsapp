import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { IntegrationOutbox, OutboxEventType, OutboxStatus } from './entities/integration-outbox.entity';

@Injectable()
export class IntegrationOutboxService {
  private readonly logger = new Logger(IntegrationOutboxService.name);

  constructor(
    @InjectRepository(IntegrationOutbox)
    private readonly repo: Repository<IntegrationOutbox>,
  ) {}

  /**
   * Enregistre un événement dans l'outbox.
   * Idempotent : si une entrée pending/processing existe déjà pour
   * (eventType, entityId), aucune nouvelle entrée n'est créée.
   * Optionnellement s'exécute dans un EntityManager de transaction externe.
   */
  async enqueue(
    eventType: OutboxEventType,
    entityId: string,
    payload: object,
    manager?: EntityManager,
  ): Promise<IntegrationOutbox | null> {
    const repo = manager ? manager.getRepository(IntegrationOutbox) : this.repo;

    const existing = await repo.findOne({
      where: { eventType, entityId, status: In(['pending', 'processing'] as OutboxStatus[]) },
      select: ['id'],
    });
    if (existing) return null;

    const payloadJson = JSON.stringify(payload);
    const payloadHash = IntegrationOutbox.computeHash(payload);

    return repo.save(
      repo.create({ eventType, entityId, payloadJson, payloadHash, status: 'pending', nextRetryAt: null }),
    );
  }

  /**
   * Réclame un lot d'entrées à traiter (pending ou failed-and-due).
   * Les marque 'processing' atomiquement.
   */
  async claimBatch(limit = 20): Promise<IntegrationOutbox[]> {
    const now = new Date();

    const entries = await this.repo
      .createQueryBuilder('o')
      .where('o.status = :pending', { pending: 'pending' })
      .orWhere('(o.status = :failed AND (o.nextRetryAt IS NULL OR o.nextRetryAt <= :now))', {
        failed: 'failed',
        now,
      })
      .orderBy('o.createdAt', 'ASC')
      .take(limit)
      .getMany();

    if (entries.length === 0) return [];

    await this.repo.update(
      { id: In(entries.map((e) => e.id)) },
      { status: 'processing' },
    );

    return entries;
  }

  async markSuccess(id: string): Promise<void> {
    await this.repo.update(id, {
      status:      'success',
      processedAt: new Date(),
      lastError:   null,
    });
  }

  /** Backoff exponentiel : 2^attempt * 60s, plafonné à 24h. */
  async markFailed(id: string, error: string, attemptCount: number): Promise<void> {
    const backoffSec = Math.min(Math.pow(2, attemptCount) * 60, 86_400);
    const nextRetryAt = new Date(Date.now() + backoffSec * 1_000);

    await this.repo.update(id, {
      status:       'failed',
      lastError:    error.slice(0, 2_000),
      attemptCount: attemptCount + 1,
      nextRetryAt,
    });

    this.logger.warn(
      `Outbox entry ${id} marked failed (attempt ${attemptCount + 1}), retry at ${nextRetryAt.toISOString()}`,
    );
  }

  async getStats(): Promise<Record<OutboxStatus, number>> {
    const rows = await this.repo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('o.status')
      .getRawMany<{ status: string; count: string }>();

    return {
      pending:    0,
      processing: 0,
      success:    0,
      failed:     0,
      ...Object.fromEntries(rows.map((r) => [r.status, Number(r.count)])),
    } as Record<OutboxStatus, number>;
  }

  /** Purge les entrées success de plus de N jours. */
  async purgeOldSuccess(days = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const result = await this.repo.delete({
      status:    'success',
      createdAt: LessThanOrEqual(cutoff),
    });
    return result.affected ?? 0;
  }

  /** Entrées failed récentes pour le dashboard admin. */
  async getFailedEntries(limit = 50, offset = 0): Promise<{ data: IntegrationOutbox[]; total: number }> {
    const [data, total] = await this.repo.findAndCount({
      where:  { status: 'failed' },
      order:  { createdAt: 'DESC' },
      take:   limit,
      skip:   offset,
    });
    return { data, total };
  }

  /** Entrées pending depuis plus de N minutes (stagnantes). */
  async getStalePendingCount(olderThanMinutes = 10): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    return this.repo.count({
      where: { status: 'pending', createdAt: LessThanOrEqual(cutoff) },
    });
  }

  /** Re-planifie manuellement une entrée failed → pending pour le prochain cycle. */
  async requeueEntry(id: string): Promise<IntegrationOutbox> {
    const entry = await this.repo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException(`Entrée outbox ${id} introuvable`);
    await this.repo.update(id, { status: 'pending', nextRetryAt: null, lastError: null });
    return { ...entry, status: 'pending', nextRetryAt: null, lastError: null };
  }
}
