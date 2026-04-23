import { WebhookIdempotencyPurgeService } from '../webhook-idempotency-purge.service';
import { WebhookMetricsService } from '../webhook-metrics.service';
import { Repository } from 'typeorm';
import { WebhookEventLog } from '../entities/webhook-event.entity';

function makeRepo(idRows: { id: string }[] = [], deleteAffected = 0) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(idRows),
  };
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    delete: jest.fn().mockResolvedValue({ affected: deleteAffected }),
    count: jest.fn().mockResolvedValue(0),
    qb,
  } as unknown as Repository<WebhookEventLog> & { qb: typeof qb };
}

describe('WebhookIdempotencyPurgeService', () => {
  const fixedNow = 1700000000000;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.WEBHOOK_IDEMPOTENCY_TTL_DAYS;
  });

  it('purges events older than TTL and records metric', async () => {
    process.env.WEBHOOK_IDEMPOTENCY_TTL_DAYS = '1';
    const ids = [{ id: 'id-1' }, { id: 'id-2' }];
    const repo = makeRepo(ids, 2);
    const metrics = new WebhookMetricsService();
    const fakeCronConfig = { registerHandler: () => undefined, findByKey: async () => null } as any;
    const service = new WebhookIdempotencyPurgeService(repo, metrics, fakeCronConfig);

    await service.purgeOldEvents();

    // La sélection des IDs utilise le QueryBuilder
    expect(repo.createQueryBuilder).toHaveBeenCalledWith('e');
    expect(repo.qb.where).toHaveBeenCalledWith('e.createdAt < :cutoff', expect.objectContaining({ cutoff: expect.any(Date) }));
    expect(repo.qb.limit).toHaveBeenCalledWith(500);

    // La suppression utilise les IDs sélectionnés
    expect(repo.delete).toHaveBeenCalledWith(['id-1', 'id-2']);

    // La métrique est enregistrée
    const snapshot = metrics.snapshot() as any;
    expect(snapshot.counters['idempotency_ttl_purge_total']).toBe(2);
  });

  it('ne supprime rien si aucun événement éligible', async () => {
    process.env.WEBHOOK_IDEMPOTENCY_TTL_DAYS = '7';
    const repo = makeRepo([], 0);
    const metrics = new WebhookMetricsService();
    const fakeCronConfig = { registerHandler: () => undefined, findByKey: async () => null } as any;
    const service = new WebhookIdempotencyPurgeService(repo, metrics, fakeCronConfig);

    const result = await service.purgeOldEvents();

    expect(repo.delete).not.toHaveBeenCalled();
    expect(result).toContain('0 événement');
    const snapshot = metrics.snapshot() as any;
    expect(snapshot.counters['idempotency_ttl_purge_total'] ?? 0).toBe(0);
  });
});
