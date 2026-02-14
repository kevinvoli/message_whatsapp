import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WhapiController } from '../whapi.controller';
import { WebhookMetricsService } from '../webhook-metrics.service';

const buildController = () =>
  new WhapiController(
    {} as any,
    { assertRateLimits: jest.fn() } as any,
    { isDegraded: jest.fn(), isCircuitOpen: jest.fn(), record: jest.fn() } as any,
    { enqueue: jest.fn() } as any,
    new WebhookMetricsService(),
  );

describe('Webhook crypto', () => {
  const payload = {
    channel_id: 'channel-1',
    event: { type: 'messages', event: 'messages' },
    messages: [
      {
        id: 'msg-1',
        chat_id: '123@s.whatsapp.net',
        from_me: false,
        from: '123',
        from_name: 'Client',
        timestamp: Math.floor(Date.now() / 1000),
        type: 'text',
        text: { body: 'hello' },
      },
    ],
  };

  afterEach(() => {
    delete process.env.WHAPI_WEBHOOK_SECRET_HEADER;
    delete process.env.WHAPI_WEBHOOK_SECRET_VALUE;
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.NODE_ENV;
  });

  it('accepts valid whapi HMAC signature', () => {
    process.env.WHAPI_WEBHOOK_SECRET_HEADER = 'x-whapi-signature';
    process.env.WHAPI_WEBHOOK_SECRET_VALUE = 'secret';
    const rawBody = Buffer.from(JSON.stringify(payload));
    const digest = createHmac('sha256', 'secret').update(rawBody).digest('hex');
    const signature = `sha256=${digest}`;

    const controller = buildController();
    expect(() =>
      (controller as any).assertWhapiSecret(
        { 'x-whapi-signature': signature },
        rawBody,
        payload,
      ),
    ).not.toThrow();
  });

  it('rejects invalid whapi signature', () => {
    process.env.WHAPI_WEBHOOK_SECRET_HEADER = 'x-whapi-signature';
    process.env.WHAPI_WEBHOOK_SECRET_VALUE = 'secret';
    const rawBody = Buffer.from(JSON.stringify(payload));
    const digest = createHmac('sha256', 'bad-secret')
      .update(rawBody)
      .digest('hex');
    const signature = `sha256=${digest}`;

    const controller = buildController();
    expect(() =>
      (controller as any).assertWhapiSecret(
        { 'x-whapi-signature': signature },
        rawBody,
        payload,
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects missing meta signature', () => {
    process.env.WHATSAPP_APP_SECRET = 'meta-secret';
    const controller = buildController();
    expect(() =>
      (controller as any).assertMetaSignature({}, undefined, payload),
    ).toThrow(UnauthorizedException);
  });

  it('requires rawBody in production', () => {
    process.env.WHAPI_WEBHOOK_SECRET_HEADER = 'x-whapi-signature';
    process.env.WHAPI_WEBHOOK_SECRET_VALUE = 'secret';
    process.env.NODE_ENV = 'production';
    const controller = buildController();
    expect(() =>
      (controller as any).assertWhapiSecret(
        { 'x-whapi-signature': 'sha256=abc' },
        undefined,
        payload,
      ),
    ).toThrow(HttpException);
  });
});
