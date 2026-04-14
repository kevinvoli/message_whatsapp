import { WebhookIdempotencyPurgeService } from '../webhook-idempotency-purge.service';
import { WebhookMetricsService } from '../webhook-metrics.service';
import { Repository } from 'typeorm';
import { WebhookEventLog } from '../entities/webhook-event.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQbMock(ids: { id: string }[]) {
  const qb = {
    select:  jest.fn().mockReturnThis(),
    where:   jest.fn().mockReturnThis(),
    limit:   jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(ids),
  };
  return qb;
}

function makeRepo(ids: { id: string }[], affected = ids.length) {
  return {
    createQueryBuilder: jest.fn().mockReturnValue(makeQbMock(ids)),
    delete:  jest.fn().mockResolvedValue({ affected }),
    count:   jest.fn().mockResolvedValue(ids.length),
  } as unknown as Repository<WebhookEventLog>;
}

const fakeCronConfig = {
  registerHandler:        () => undefined,
  registerPreviewHandler: () => undefined,
  findByKey:              async () => null,
} as any;

// ─── Tests ────────────────────────────────────────────────────────────────────

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
    const repo = makeRepo([{ id: 'evt-1' }, { id: 'evt-2' }]);
    const metrics = new WebhookMetricsService();
    const service = new WebhookIdempotencyPurgeService(repo, metrics, fakeCronConfig);

    const result = await service.purgeOldEvents();

    // createQueryBuilder appelé avec le bon alias
    expect(repo.createQueryBuilder).toHaveBeenCalledWith('e');

    // delete appelé avec les IDs retournés par getMany
    expect(repo.delete).toHaveBeenCalledWith(['evt-1', 'evt-2']);

    // métrique enregistrée
    const snapshot = metrics.snapshot() as any;
    expect(snapshot.counters['idempotency_ttl_purge_total']).toBe(2);

    // message retourné contient le nombre d'événements supprimés
    expect(result).toContain('2');
  });

  it('retourne "0 événement" si aucun ID à purger', async () => {
    process.env.WEBHOOK_IDEMPOTENCY_TTL_DAYS = '14';
    const repo = makeRepo([]);
    const metrics = new WebhookMetricsService();
    const service = new WebhookIdempotencyPurgeService(repo, metrics, fakeCronConfig);

    const result = await service.purgeOldEvents();

    expect(repo.delete).not.toHaveBeenCalled();
    expect(result).toContain('0');

    const snapshot = metrics.snapshot() as any;
    expect(snapshot.counters['idempotency_ttl_purge_total'] ?? 0).toBe(0);
  });

  it('previewPurge retourne le nombre de candidats et la date de coupure', async () => {
    process.env.WEBHOOK_IDEMPOTENCY_TTL_DAYS = '7';
    const repo = makeRepo([{ id: 'evt-1' }]);
    const metrics = new WebhookMetricsService();
    const service = new WebhookIdempotencyPurgeService(repo, metrics, fakeCronConfig);

    const preview = await service.previewPurge();

    expect(preview.ttlDays).toBe(7);
    expect(preview.total).toBe(1);
    expect(typeof preview.cutoffDate).toBe('string');
  });
});
