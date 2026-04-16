import { HttpException } from '@nestjs/common';
import { WhapiController } from '../whapi.controller';
import { WebhookMetricsService } from '../webhook-metrics.service';

const buildController = () =>
  new WhapiController(
    {} as any,
    { assertRateLimits: jest.fn() } as any,
    {
      isDegraded: jest.fn(),
      isCircuitOpen: jest.fn(),
      record: jest.fn(),
    } as any,
    { enqueue: jest.fn() } as any,
    new WebhookMetricsService(),
    {} as any,
    {} as any,
    { add: jest.fn().mockResolvedValue({}) } as any, // webhookQueue
  );

describe('Webhook payload validation', () => {
  it('rejects invalid whapi payload', () => {
    const controller = buildController();
    expect(() =>
      (controller as any).assertWhapiPayload({ channel_id: null }),
    ).toThrow(HttpException);
  });

  it('rejects whapi payload without messages/statuses', () => {
    const controller = buildController();
    expect(() =>
      (controller as any).assertWhapiPayload({
        channel_id: 'ch-1',
        event: { type: 'messages', event: 'messages' },
      }),
    ).toThrow(HttpException);
  });

  it('rejects invalid meta payload', () => {
    const controller = buildController();
    expect(() => (controller as any).assertMetaPayload({})).toThrow(
      HttpException,
    );
  });

  it('rejects meta payload without messages/statuses', () => {
    const controller = buildController();
    expect(() =>
      (controller as any).assertMetaPayload({
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
                },
              },
            ],
          },
        ],
      }),
    ).toThrow(HttpException);
  });
});
