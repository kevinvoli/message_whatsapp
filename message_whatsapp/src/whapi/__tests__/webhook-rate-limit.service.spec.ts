import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookRateLimitService } from '../webhook-rate-limit.service';

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('WebhookRateLimitService', () => {
  it('enforces tenant quota per minute', () => {
    const service = new WebhookRateLimitService(
      makeConfig({
        WEBHOOK_GLOBAL_RPS: '1000',
        WEBHOOK_PROVIDER_RPS: '1000',
        WEBHOOK_IP_RPS: '1000',
        WEBHOOK_TENANT_RPM: '2',
      }),
    );
    const tenantId = 'tenant-1';

    service.assertRateLimits('whapi', null, tenantId);
    service.assertRateLimits('whapi', null, tenantId);

    expect(() => service.assertRateLimits('whapi', null, tenantId)).toThrow(
      HttpException,
    );
  });
});
