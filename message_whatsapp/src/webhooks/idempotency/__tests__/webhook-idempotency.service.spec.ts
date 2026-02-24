import { WebhookIdempotencyService } from '../webhook-idempotency.service';
import { WebhookEventLog } from 'src/whapi/entities/webhook-event.entity';
import { WebhookMetricsService } from 'src/whapi/webhook-metrics.service';
import { QueryFailedError, Repository } from 'typeorm';

class FakeRepo {
  private readonly keys = new Set<string>();
  private readonly payloads = new Map<string, string>();

  create(entity: WebhookEventLog): WebhookEventLog {
    return entity;
  }

  async save(entity: WebhookEventLog): Promise<WebhookEventLog> {
    const key = `${entity.tenant_id ?? 'null'}|${entity.provider}|${entity.event_key}`;
    if (this.keys.has(key)) {
      const err = new QueryFailedError('insert', [], new Error('duplicate'));
      (err as any).driverError = { code: 'ER_DUP_ENTRY' };
      throw err;
    }
    this.keys.add(key);
    if (entity.payload_hash) {
      this.payloads.set(key, entity.payload_hash);
    }
    return entity;
  }

  async findOne(options: {
    where: { event_key: string; provider: string; tenant_id?: string | null };
  }) {
    const key = `${options.where.tenant_id ?? 'null'}|${options.where.provider}|${options.where.event_key}`;
    const payload = this.payloads.get(key);
    if (!payload) return null;
    return {
      event_key: options.where.event_key,
      provider: options.where.provider,
      tenant_id: options.where.tenant_id ?? null,
      payload_hash: payload,
    } as WebhookEventLog;
  }
}

describe('WebhookIdempotencyService', () => {
  it('deduplicates whapi messages', async () => {
    const repo = new FakeRepo() as unknown as Repository<WebhookEventLog>;
    const metrics = new WebhookMetricsService();
    const service = new WebhookIdempotencyService(repo, metrics);

    const payload = {
      channel_id: 'ch-1',
      event: { type: 'messages', event: 'messages' },
      messages: [
        {
          id: 'msg-1',
          type: 'text',
          channel_id: 'ch-1',
          chat_id: '123@s.whatsapp.net',
          from: '123',
          from_me: false,
          from_name: 'Client',
          source: 'whapi',
          timestamp: 1700000000,
          text: { body: 'hello' },
        },
      ],
    };

    const first = await service.check({
      payload,
      provider: 'whapi',
      tenantId: 'tenant-1',
    });
    const second = await service.check({
      payload,
      provider: 'whapi',
      tenantId: 'tenant-1',
    });

    expect(first).toBe('accepted');
    expect(second).toBe('duplicate');
  });

  it('deduplicates meta messages', async () => {
    const repo = new FakeRepo() as unknown as Repository<WebhookEventLog>;
    const metrics = new WebhookMetricsService();
    const service = new WebhookIdempotencyService(repo, metrics);

    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+123',
                  phone_number_id: 'phone-1',
                },
                messages: [
                  {
                    from: '111',
                    id: 'meta-msg-1',
                    timestamp: '1700003333',
                    type: 'text',
                    text: { body: 'bonjour' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const first = await service.check({
      payload,
      provider: 'meta',
      tenantId: 'tenant-meta',
    });
    const second = await service.check({
      payload,
      provider: 'meta',
      tenantId: 'tenant-meta',
    });

    expect(first).toBe('accepted');
    expect(second).toBe('duplicate');
  });

  it('detects conflict on different payload hash', async () => {
    const repo = new FakeRepo() as unknown as Repository<WebhookEventLog>;
    const metrics = new WebhookMetricsService();
    const service = new WebhookIdempotencyService(repo, metrics);

    const base = {
      channel_id: 'ch-1',
      event: { type: 'messages', event: 'messages' },
      messages: [
        {
          id: 'msg-1',
          type: 'text',
          channel_id: 'ch-1',
          chat_id: '123@s.whatsapp.net',
          from: '123',
          from_me: false,
          from_name: 'Client',
          source: 'whapi',
          timestamp: 1700000000,
          text: { body: 'hello' },
        },
      ],
    };
    const payloadA = base;
    const payloadB = {
      ...base,
      messages: [
        {
          ...base.messages[0],
          text: { body: 'different' },
        },
      ],
    };

    await service.check({
      payload: payloadA,
      provider: 'whapi',
      tenantId: 'tenant-1',
    });
    const result = await service.check({
      payload: payloadB,
      provider: 'whapi',
      tenantId: 'tenant-1',
    });

    expect(result).toBe('conflict');
  });

  it('uses fallback hash with minute bucket when ids missing', async () => {
    const repo = new FakeRepo() as unknown as Repository<WebhookEventLog>;
    const metrics = new WebhookMetricsService();
    const service = new WebhookIdempotencyService(repo, metrics);

    const payload = {
      channel_id: 'ch-1',
      event: { type: 'messages', event: 'messages' },
      messages: [
        {
          id: null,
          type: 'text',
          channel_id: 'ch-1',
          chat_id: '123@s.whatsapp.net',
          from: '123',
          from_me: false,
          from_name: 'Client',
          source: 'whapi',
          timestamp: 1700000000,
          text: { body: 'hello' },
        },
      ],
    };

    const first = await service.check({
      payload,
      provider: 'whapi',
      tenantId: 'tenant-1',
    });
    const second = await service.check({
      payload,
      provider: 'whapi',
      tenantId: 'tenant-1',
    });

    expect(first).toBe('accepted');
    expect(second).toBe('duplicate');
  });
});
