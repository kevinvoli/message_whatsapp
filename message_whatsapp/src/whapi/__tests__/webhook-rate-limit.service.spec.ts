import { HttpException } from '@nestjs/common';
import { WebhookRateLimitService } from '../webhook-rate-limit.service';

describe('WebhookRateLimitService', () => {
  afterEach(() => {
    delete process.env.WEBHOOK_GLOBAL_RPS;
    delete process.env.WEBHOOK_PROVIDER_RPS;
    delete process.env.WEBHOOK_IP_RPS;
    delete process.env.WEBHOOK_TENANT_RPM;
    delete process.env.REDIS_WEBHOOK_RATE_LIMIT_ENABLED;
  });

  it('enforces tenant quota per minute', async () => {
    process.env.WEBHOOK_GLOBAL_RPS = '1000';
    process.env.WEBHOOK_PROVIDER_RPS = '1000';
    process.env.WEBHOOK_IP_RPS = '1000';
    process.env.WEBHOOK_TENANT_RPM = '2';

    const service = new WebhookRateLimitService(null);
    const tenantId = 'tenant-1';

    await service.assertRateLimits('whapi', null, tenantId);
    await service.assertRateLimits('whapi', null, tenantId);

    await expect(service.assertRateLimits('whapi', null, tenantId)).rejects.toThrow(
      HttpException,
    );
  });
});
