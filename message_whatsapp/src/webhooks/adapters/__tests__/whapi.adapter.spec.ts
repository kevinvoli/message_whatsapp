import { WhapiAdapter } from '../whapi.adapter';
import { WhapiWebhookPayload } from 'src/whapi/interface/whapi-webhook.interface';

describe('WhapiAdapter', () => {
  const adapter = new WhapiAdapter();

  it('maps basic text message to unified', () => {
    const payload: WhapiWebhookPayload = {
      channel_id: 'channel-1',
      event: { type: 'messages', event: 'messages' },
      messages: [
        {
          id: 'msg-1',
          type: 'text',
          channel_id: 'channel-1',
          chat_id: '12345@s.whatsapp.net',
          from: '12345',
          from_me: false,
          from_name: 'Client A',
          source: 'whapi',
          timestamp: 1700000000,
          text: { body: 'hello' },
        },
      ],
    };

    const result = adapter.normalizeMessages(payload, {
      provider: 'whapi',
      tenantId: 'tenant-1',
      channelId: payload.channel_id,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      provider: 'whapi',
      providerMessageId: 'msg-1',
      tenantId: 'tenant-1',
      channelId: 'channel-1',
      chatId: '12345@s.whatsapp.net',
      from: '12345',
      fromName: 'Client A',
      direction: 'in',
      type: 'text',
      text: 'hello',
    });
  });

  it('maps media message', () => {
    const payload: WhapiWebhookPayload = {
      channel_id: 'channel-2',
      event: { type: 'messages', event: 'messages' },
      messages: [
        {
          id: 'msg-2',
          type: 'image',
          channel_id: 'channel-2',
          chat_id: '555@s.whatsapp.net',
          from: '555',
          from_me: false,
          from_name: 'Client B',
          source: 'whapi',
          timestamp: 1700001234,
          image: {
            id: 'media-1',
            mime_type: 'image/jpeg',
            caption: 'photo',
          },
        },
      ],
    };

    const result = adapter.normalizeMessages(payload, {
      provider: 'whapi',
      tenantId: 'tenant-2',
      channelId: payload.channel_id,
    });

    expect(result[0].media).toMatchObject({
      id: 'media-1',
      mimeType: 'image/jpeg',
      caption: 'photo',
    });
  });

  it('maps statuses', () => {
    const payload: WhapiWebhookPayload = {
      channel_id: 'channel-3',
      event: { type: 'statuses', event: 'statuses' },
      statuses: [
        {
          id: 'msg-3',
          code: 200,
          status: 'delivered',
          recipient_id: '777@s.whatsapp.net',
          timestamp: 1700002222,
        },
      ],
    };

    const result = adapter.normalizeStatuses(payload, {
      provider: 'whapi',
      tenantId: 'tenant-3',
      channelId: payload.channel_id,
    });

    expect(result[0]).toMatchObject({
      provider: 'whapi',
      providerMessageId: 'msg-3',
      tenantId: 'tenant-3',
      channelId: 'channel-3',
      recipientId: '777@s.whatsapp.net',
      status: 'delivered',
    });
  });
});
