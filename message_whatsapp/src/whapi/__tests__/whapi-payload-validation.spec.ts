import { HttpException } from '@nestjs/common';
import { WebhookPayloadValidationService } from '../webhook-payload-validation.service';

const buildService = () => new WebhookPayloadValidationService();

describe('Webhook payload validation', () => {
  it('rejects invalid whapi payload', () => {
    const service = buildService();
    expect(() =>
      service.assertWhapiPayload({ channel_id: null } as any),
    ).toThrow(HttpException);
  });

  it('rejects whapi payload without messages/statuses', () => {
    const service = buildService();
    expect(() =>
      service.assertWhapiPayload({
        channel_id: 'ch-1',
        event: { type: 'messages', event: 'messages' },
      } as any),
    ).toThrow(HttpException);
  });

  it('rejects invalid meta payload', () => {
    const service = buildService();
    expect(() => service.assertMetaPayload({})).toThrow(HttpException);
  });

  it('rejects meta payload without messages/statuses', () => {
    const service = buildService();
    expect(() =>
      service.assertMetaPayload({
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
