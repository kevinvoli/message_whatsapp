import { HttpException } from '@nestjs/common';
import { WebhookRateLimitService } from '../webhook-rate-limit.service';

describe('WebhookRateLimitService', () => {
  afterEach(() => {
    delete process.env.WEBHOOK_GLOBAL_RPS;
    delete process.env.WEBHOOK_PROVIDER_RPS;
    delete process.env.WEBHOOK_IP_RPS;
    delete process.env.WEBHOOK_TENANT_RPM;
  });

  it('enforces tenant quota per minute', () => {
    process.env.WEBHOOK_GLOBAL_RPS = '1000';
    process.env.WEBHOOK_PROVIDER_RPS = '1000';
    process.env.WEBHOOK_IP_RPS = '1000';
    process.env.WEBHOOK_TENANT_RPM = '2';

    const service = new WebhookRateLimitService();
    const tenantId = 'tenant-1';

    service.assertRateLimits('whapi', null, tenantId);
    service.assertRateLimits('whapi', null, tenantId);

    expect(() => service.assertRateLimits('whapi', null, tenantId)).toThrow(
      HttpException,
    );
  });
});
