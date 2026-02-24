import { randomUUID, createHash } from 'crypto';
import {
  WhapiMessage,
  WhapiStatus,
  WhapiMessageType,
  MetaWebhookPayload,
  MetaStatusPayload,
  MetaMessagePayload,
} from './payload.js';

// ============================================================
// Helpers
// ============================================================

function generateIvoryCoastNumber(): string {
  const prefixes = ['07', '01', '05'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const rest = Math.floor(10000000 + Math.random() * 90000000);
  return `225${prefix}${rest}`;
}

function ts(): number {
  return Math.floor(Date.now() / 1000);
}

function fakeMediaId(): string {
  return randomUUID().replace(/-/g, '');
}

function fakeSha256(): string {
  return createHash('sha256').update(randomUUID()).digest('hex');
}

// ============================================================
// Chat IDs
// ============================================================

export function generateChatIds(count: number): string[] {
  return Array.from({ length: count }, () => {
    const phone = generateIvoryCoastNumber();
    return `${phone}@s.whatsapp.net`;
  });
}

// ============================================================
// Whapi message generators
// ============================================================

export function generateMessage(chatId: string): WhapiMessage {
  return {
    id: randomUUID(),
    from_me: false,
    type: 'text',
    chat_id: chatId,
    timestamp: ts(),
    source: 'mobile',
    from: chatId.split('@')[0],
    from_name: `Bot Stress ${Math.random().toString(36).slice(2)}`,
    text: { body: `Message de test ${Math.random().toString(36).slice(2)}` },
  };
}

export function generateWhapiMediaMessage(
  chatId: string,
  type: 'image' | 'video' | 'audio' | 'voice' | 'document' = 'image',
): WhapiMessage {
  const base: WhapiMessage = {
    id: randomUUID(),
    from_me: false,
    type,
    chat_id: chatId,
    timestamp: ts(),
    source: 'mobile',
    from: chatId.split('@')[0],
    from_name: `Bot Media ${Math.random().toString(36).slice(2)}`,
  };

  const mediaBase = {
    id: fakeMediaId(),
    mime_type: 'application/octet-stream',
    file_size: Math.floor(1000 + Math.random() * 500000),
    sha256: fakeSha256(),
  };

  switch (type) {
    case 'image':
      base.image = { ...mediaBase, mime_type: 'image/jpeg', caption: 'Photo test' };
      break;
    case 'video':
      base.video = { ...mediaBase, mime_type: 'video/mp4', caption: 'Video test' };
      break;
    case 'audio':
      base.audio = { ...mediaBase, mime_type: 'audio/ogg' };
      break;
    case 'voice':
      base.voice = { ...mediaBase, mime_type: 'audio/ogg; codecs=opus' };
      break;
    case 'document':
      base.document = {
        ...mediaBase,
        mime_type: 'application/pdf',
        filename: `document_${Date.now()}.pdf`,
      };
      break;
  }

  return base;
}

export function generateWhapiLocationMessage(chatId: string): WhapiMessage {
  return {
    id: randomUUID(),
    from_me: false,
    type: 'location',
    chat_id: chatId,
    timestamp: ts(),
    source: 'mobile',
    from: chatId.split('@')[0],
    from_name: `Bot Location ${Math.random().toString(36).slice(2)}`,
    location: {
      latitude: 5.3364 + Math.random() * 0.1,
      longitude: -4.0267 + Math.random() * 0.1,
      name: 'Abidjan Test Location',
      address: 'Cocody, Abidjan, Cote d\'Ivoire',
    },
  };
}

export function generateWhapiInteractiveMessage(chatId: string): WhapiMessage {
  return {
    id: randomUUID(),
    from_me: false,
    type: 'reply',
    chat_id: chatId,
    timestamp: ts(),
    source: 'mobile',
    from: chatId.split('@')[0],
    from_name: `Bot Interactive ${Math.random().toString(36).slice(2)}`,
    reply: {
      type: 'buttons_reply',
      buttons_reply: {
        id: `btn_${Math.random().toString(36).slice(2)}`,
        title: 'Confirmer',
      },
    },
  };
}

/** Pick a random Whapi message type */
export function generateRandomWhapiMessage(chatId: string): WhapiMessage {
  const types: Array<() => WhapiMessage> = [
    () => generateMessage(chatId),
    () => generateWhapiMediaMessage(chatId, 'image'),
    () => generateWhapiMediaMessage(chatId, 'video'),
    () => generateWhapiMediaMessage(chatId, 'audio'),
    () => generateWhapiMediaMessage(chatId, 'document'),
    () => generateWhapiLocationMessage(chatId),
    () => generateWhapiInteractiveMessage(chatId),
  ];
  return types[Math.floor(Math.random() * types.length)]();
}

// ============================================================
// Whapi status generators
// ============================================================

export function generateWhapiStatus(
  chatId: string,
  messageId?: string,
): WhapiStatus {
  const statuses: WhapiStatus['status'][] = ['delivered', 'read', 'failed'];
  const status = statuses[Math.floor(Math.random() * statuses.length)];

  return {
    id: messageId ?? randomUUID(),
    status,
    chat_id: chatId,
    recipient_id: chatId.split('@')[0],
    timestamp: ts(),
    ...(status === 'failed' ? { code: 131051 } : {}),
  };
}

// ============================================================
// Meta message generators
// ============================================================

export function generateMetaPayload(params: {
  phoneNumberId: string;
  wabaId: string;
  from: string;
  name: string;
  messageId: string;
  body: string;
  omitContact?: boolean;
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
              ...(params.omitContact
                ? {}
                : {
                    contacts: [
                      {
                        wa_id: params.from,
                        profile: { name: params.name },
                      },
                    ],
                  }),
              messages: [
                {
                  from: params.from,
                  id: params.messageId,
                  timestamp: `${ts()}`,
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

export function generateMetaMediaMessage(params: {
  phoneNumberId: string;
  wabaId: string;
  from: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document';
}): MetaWebhookPayload {
  const message: MetaMessagePayload = {
    from: params.from,
    id: `wamid.${randomUUID()}`,
    timestamp: `${ts()}`,
    type: params.type,
  };

  const media = {
    id: fakeMediaId(),
    mime_type: 'application/octet-stream',
    sha256: fakeSha256(),
  };

  switch (params.type) {
    case 'image':
      message.image = { ...media, mime_type: 'image/jpeg', caption: 'Photo test' };
      break;
    case 'video':
      message.video = { ...media, mime_type: 'video/mp4', caption: 'Video test' };
      break;
    case 'audio':
      message.audio = { ...media, mime_type: 'audio/ogg' };
      break;
    case 'document':
      message.document = {
        ...media,
        mime_type: 'application/pdf',
        filename: `doc_${Date.now()}.pdf`,
      };
      break;
  }

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
                { wa_id: params.from, profile: { name: params.name } },
              ],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

export function generateMetaInteractiveMessage(params: {
  phoneNumberId: string;
  wabaId: string;
  from: string;
  name: string;
}): MetaWebhookPayload {
  const message: MetaMessagePayload = {
    from: params.from,
    id: `wamid.${randomUUID()}`,
    timestamp: `${ts()}`,
    type: 'interactive',
    interactive: {
      type: 'button_reply',
      button_reply: {
        id: `btn_${Math.random().toString(36).slice(2)}`,
        title: 'Oui',
      },
    },
  };

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
                { wa_id: params.from, profile: { name: params.name } },
              ],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

// ============================================================
// Meta status generators
// ============================================================

export function generateMetaStatusPayload(params: {
  phoneNumberId: string;
  wabaId: string;
  recipientId: string;
  messageId?: string;
}): MetaWebhookPayload {
  const statuses: MetaStatusPayload['status'][] = [
    'sent',
    'delivered',
    'read',
    'failed',
  ];
  const status = statuses[Math.floor(Math.random() * statuses.length)];

  const statusPayload: MetaStatusPayload = {
    id: params.messageId ?? `wamid.${randomUUID()}`,
    status,
    timestamp: `${ts()}`,
    recipient_id: params.recipientId,
    ...(status === 'failed'
      ? { errors: [{ code: 131047, title: 'Re-engagement message' }] }
      : {}),
  };

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
              statuses: [statusPayload],
            },
          },
        ],
      },
    ],
  };
}
