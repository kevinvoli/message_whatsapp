import { randomUUID } from 'crypto';
import { WhapiMessage, MetaWebhookPayload } from './payload.js';

export function generateMessage(chatId: string): WhapiMessage {
  return {
    id: randomUUID(),
    from_me: false,
    type: 'text',
    chat_id: chatId,
    timestamp: Math.floor(Date.now() / 1000), // ⚠ secondes
    source: 'mobile',
    from: chatId.split('@')[0],
    from_name: `Bot Stress ${Math.random().toString(36).slice(2)}`,
    text: {
      body: `Message de test ${Math.random().toString(36).slice(2)}`,
    },
  };
}
export function generateChatIds(count: number): string[] {
  return Array.from({ length: count }, () => {
    const phone = generateIvoryCoastNumber();
    // return `${phone}@s.whatsapp.net`;
    return `${phone}@s.whatsapp.net`
  });
}

export function generateMetaPayload(params: {
  phoneNumberId: string;
  wabaId: string;
  from: string;
  name: string;
  messageId: string;
  body: string;
}): MetaWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: params.wabaId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '0000',
                phone_number_id: params.phoneNumberId,
              },
              contacts: [
                {
                  wa_id: params.from,
                  profile: { name: params.name },
                },
              ],
              messages: [
                {
                  from: params.from,
                  id: params.messageId,
                  timestamp: `${Math.floor(Date.now() / 1000)}`,
                  type: 'text',
                  text: { body: params.body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function generateIvoryCoastNumber(): string {
  // 07xxxxxxxx ou 01xxxxxxxx (exemples réalistes)
  const prefixes = ['07', '01', '05'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

  const rest = Math.floor(10000000 + Math.random() * 90000000);

  return `225${prefix}${rest}`;
}
