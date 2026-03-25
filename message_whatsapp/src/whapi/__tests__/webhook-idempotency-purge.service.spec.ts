import { WebhookIdempotencyPurgeService } from '../webhook-idempotency-purge.service';
import { WebhookMetricsService } from '../webhook-metrics.service';
import { Repository } from 'typeorm';
import { WebhookEventLog } from '../entities/webhook-event.entity';

class FakeRepo {
  public lastDeleteArgs: any;
  constructor(private readonly affected: number) {}

  async delete(args: any) {
    this.lastDeleteArgs = args;
    return { affected: this.affected };
  }
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
    const repo = new FakeRepo(2) as unknown as Repository<WebhookEventLog>;
    const metrics = new WebhookMetricsService();
    const fakeCronConfig = { registerHandler: () => undefined, findByKey: async () => null } as any;
    const fakeConfigService = { get: (key: string) => process.env[key] } as any;
    const service = new WebhookIdempotencyPurgeService(repo, metrics, fakeCronConfig, fakeConfigService);

    await service.purgeOldEvents();

    expect((repo as any).lastDeleteArgs).toBeTruthy();
    const operator = (repo as any).lastDeleteArgs.createdAt;
    expect(operator?.value instanceof Date).toBe(true);
    const expectedCutoff = new Date(fixedNow - 24 * 60 * 60 * 1000);
    expect(operator.value.toISOString()).toBe(expectedCutoff.toISOString());

    const snapshot = metrics.snapshot() as any;
    expect(snapshot.counters['idempotency_ttl_purge_total']).toBe(2);
  });
});
