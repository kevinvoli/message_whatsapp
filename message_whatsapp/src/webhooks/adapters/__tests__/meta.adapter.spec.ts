import { MetaAdapter } from '../meta.adapter';
import { MetaWebhookPayload } from 'src/whapi/interface/whatsapp-whebhook.interface';

describe('MetaAdapter', () => {
  const adapter = new MetaAdapter();

  it('maps text message', () => {
    const payload: MetaWebhookPayload = {
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
                contacts: [
                  {
                    wa_id: '111',
                    profile: { name: 'Client Meta' },
                  },
                ],
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

    const result = adapter.normalizeMessages(payload, {
      provider: 'meta',
      tenantId: 'tenant-meta',
      channelId: 'phone-1',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      provider: 'meta',
      providerMessageId: 'meta-msg-1',
      tenantId: 'tenant-meta',
      channelId: 'phone-1',
      chatId: '111@s.whatsapp.net',
      from: '111',
      fromName: 'Client Meta',
      direction: 'in',
      type: 'text',
      text: 'bonjour',
    });
  });

  it('maps interactive button', () => {
    const payload: MetaWebhookPayload = {
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
                    from: '222',
                    id: 'meta-msg-2',
                    timestamp: '1700004444',
                    type: 'button',
                    button: {
                      payload: 'btn-1',
                      text: 'Confirmer',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = adapter.normalizeMessages(payload, {
      provider: 'meta',
      tenantId: 'tenant-meta',
      channelId: 'phone-1',
    });

    expect(result[0].interactive).toMatchObject({
      kind: 'button_reply',
      id: 'btn-1',
      title: 'Confirmer',
    });
  });

  it('maps statuses', () => {
    const payload: MetaWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-2',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+789',
                  phone_number_id: 'phone-2',
                },
                statuses: [
                  {
                    id: 'meta-msg-3',
                    status: 'read',
                    timestamp: '1700005555',
                    recipient_id: '999',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = adapter.normalizeStatuses(payload, {
      provider: 'meta',
      tenantId: 'tenant-meta-2',
      channelId: 'phone-2',
    });

    expect(result[0]).toMatchObject({
      provider: 'meta',
      providerMessageId: 'meta-msg-3',
      tenantId: 'tenant-meta-2',
      channelId: 'phone-2',
      recipientId: '999',
      status: 'read',
    });
  });
});
