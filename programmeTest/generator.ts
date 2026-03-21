import { randomUUID, createHash } from 'crypto';
import {
  WhapiMessage,
  WhapiStatus,
  WhapiMessageType,
  MetaWebhookPayload,
  MetaStatusPayload,
  MetaMessagePayload,
  MessengerWebhookPayload,
  MessengerMessaging,
  InstagramWebhookPayload,
  InstagramMessaging,
  TelegramWebhookPayload,
  TelegramMessage,
  TelegramUser,
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
// Chat IDs / user IDs par provider
// ============================================================

export function generateChatIds(count: number): string[] {
  return Array.from({ length: count }, () => {
    const phone = generateIvoryCoastNumber();
    return `${phone}@s.whatsapp.net`;
  });
}

/** Génère N IDs numériques bruts (PSID, IGSID, Telegram chat_id…) */
export function generateNumericIds(count: number): number[] {
  return Array.from({ length: count }, () =>
    Math.floor(1_000_000_000 + Math.random() * 9_000_000_000),
  );
}

function fakeTelegramFileId(): string {
  return `AAAA${randomUUID().replace(/-/g, '').substring(0, 32)}`;
}

function fakeTelegramFileUniqueId(): string {
  return randomUUID().replace(/-/g, '').substring(0, 16);
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

// ============================================================
// Messenger generators
// ============================================================

export function generateMessengerTextPayload(params: {
  psid: string;
  pageId: string;
  name?: string;
}): MessengerWebhookPayload {
  const messaging: MessengerMessaging = {
    sender: { id: params.psid },
    recipient: { id: params.pageId },
    timestamp: Date.now(),
    message: {
      mid: `m_${randomUUID().replace(/-/g, '')}`,
      text: `Message Messenger test ${Math.random().toString(36).slice(2)}`,
    },
  };
  return {
    object: 'page',
    entry: [{ id: params.pageId, time: Date.now(), messaging: [messaging] }],
  };
}

export function generateMessengerMediaPayload(params: {
  psid: string;
  pageId: string;
  type: 'image' | 'video' | 'audio' | 'file';
}): MessengerWebhookPayload {
  const messaging: MessengerMessaging = {
    sender: { id: params.psid },
    recipient: { id: params.pageId },
    timestamp: Date.now(),
    message: {
      mid: `m_${randomUUID().replace(/-/g, '')}`,
      attachments: [
        {
          type: params.type,
          payload: { url: `https://cdn.example.com/test-${params.type}.${params.type === 'file' ? 'pdf' : params.type === 'audio' ? 'mp3' : params.type}` },
        },
      ],
    },
  };
  return {
    object: 'page',
    entry: [{ id: params.pageId, time: Date.now(), messaging: [messaging] }],
  };
}

export function generateMessengerDeliveryPayload(params: {
  psid: string;
  pageId: string;
  mids?: string[];
}): MessengerWebhookPayload {
  const mids = params.mids ?? [`m_${randomUUID().replace(/-/g, '')}`];
  const messaging: MessengerMessaging = {
    sender: { id: params.psid },
    recipient: { id: params.pageId },
    timestamp: Date.now(),
    delivery: { mids, watermark: Date.now() },
  };
  return {
    object: 'page',
    entry: [{ id: params.pageId, time: Date.now(), messaging: [messaging] }],
  };
}

export function generateMessengerReadPayload(params: {
  psid: string;
  pageId: string;
}): MessengerWebhookPayload {
  const messaging: MessengerMessaging = {
    sender: { id: params.psid },
    recipient: { id: params.pageId },
    timestamp: Date.now(),
    read: { watermark: Date.now() - 1000 },
  };
  return {
    object: 'page',
    entry: [{ id: params.pageId, time: Date.now(), messaging: [messaging] }],
  };
}

export function generateMessengerRandomPayload(params: {
  psid: string;
  pageId: string;
}): MessengerWebhookPayload {
  const types = ['text', 'image', 'video', 'audio', 'file'] as const;
  const type = types[Math.floor(Math.random() * types.length)];
  if (type === 'text') return generateMessengerTextPayload(params);
  return generateMessengerMediaPayload({ ...params, type });
}

// ============================================================
// Instagram generators
// ============================================================

export function generateInstagramTextPayload(params: {
  igsid: string;
  igAccountId: string;
}): InstagramWebhookPayload {
  const messaging: InstagramMessaging = {
    sender: { id: params.igsid },
    recipient: { id: params.igAccountId },
    timestamp: Date.now(),
    message: {
      mid: `17${Math.floor(Math.random() * 1e15)}`,
      text: `Message Instagram test ${Math.random().toString(36).slice(2)}`,
    },
  };
  return {
    object: 'instagram',
    entry: [{ id: params.igAccountId, time: Date.now(), messaging: [messaging] }],
  };
}

export function generateInstagramMediaPayload(params: {
  igsid: string;
  igAccountId: string;
  type: 'image' | 'video';
}): InstagramWebhookPayload {
  const messaging: InstagramMessaging = {
    sender: { id: params.igsid },
    recipient: { id: params.igAccountId },
    timestamp: Date.now(),
    message: {
      mid: `17${Math.floor(Math.random() * 1e15)}`,
      attachments: [
        {
          type: params.type,
          payload: { url: `https://cdn.example.com/test-ig.${params.type === 'video' ? 'mp4' : 'jpg'}` },
        },
      ],
    },
  };
  return {
    object: 'instagram',
    entry: [{ id: params.igAccountId, time: Date.now(), messaging: [messaging] }],
  };
}

export function generateInstagramReadPayload(params: {
  igsid: string;
  igAccountId: string;
}): InstagramWebhookPayload {
  const messaging: InstagramMessaging = {
    sender: { id: params.igsid },
    recipient: { id: params.igAccountId },
    timestamp: Date.now(),
    read: { watermark: Date.now() - 1000 },
  };
  return {
    object: 'instagram',
    entry: [{ id: params.igAccountId, time: Date.now(), messaging: [messaging] }],
  };
}

export function generateInstagramRandomPayload(params: {
  igsid: string;
  igAccountId: string;
}): InstagramWebhookPayload {
  const types = ['text', 'image', 'video'] as const;
  const type = types[Math.floor(Math.random() * types.length)];
  if (type === 'text') return generateInstagramTextPayload(params);
  return generateInstagramMediaPayload({ ...params, type });
}

// ============================================================
// Telegram generators
// ============================================================

function makeTelegramUser(id: number): TelegramUser {
  return {
    id,
    is_bot: false,
    first_name: `User${id}`,
    username: `user_${id}`,
  };
}

function makeTelegramMessage(params: {
  chatId: number;
  userId: number;
  overrides?: Partial<TelegramMessage>;
}): TelegramMessage {
  return {
    message_id: Math.floor(1 + Math.random() * 1_000_000),
    from: makeTelegramUser(params.userId),
    chat: {
      id: params.chatId,
      type: 'private',
      first_name: `User${params.userId}`,
      username: `user_${params.userId}`,
    },
    date: ts(),
    ...params.overrides,
  };
}

export function generateTelegramTextPayload(chatId: number): TelegramWebhookPayload {
  return {
    update_id: Math.floor(10_000_000 + Math.random() * 90_000_000),
    message: makeTelegramMessage({
      chatId,
      userId: chatId,
      overrides: { text: `Message Telegram test ${Math.random().toString(36).slice(2)}` },
    }),
  };
}

export function generateTelegramPhotoPayload(chatId: number): TelegramWebhookPayload {
  const fileId = fakeTelegramFileId();
  return {
    update_id: Math.floor(10_000_000 + Math.random() * 90_000_000),
    message: makeTelegramMessage({
      chatId,
      userId: chatId,
      overrides: {
        caption: 'Photo test',
        photo: [
          { file_id: fileId, file_unique_id: fakeTelegramFileUniqueId(), width: 320, height: 240, file_size: 12000 },
          { file_id: fileId + 'b', file_unique_id: fakeTelegramFileUniqueId(), width: 800, height: 600, file_size: 80000 },
        ],
      },
    }),
  };
}

export function generateTelegramDocumentPayload(chatId: number): TelegramWebhookPayload {
  return {
    update_id: Math.floor(10_000_000 + Math.random() * 90_000_000),
    message: makeTelegramMessage({
      chatId,
      userId: chatId,
      overrides: {
        document: {
          file_id: fakeTelegramFileId(),
          file_unique_id: fakeTelegramFileUniqueId(),
          file_name: `document_${Date.now()}.pdf`,
          mime_type: 'application/pdf',
          file_size: 45000,
        },
      },
    }),
  };
}

export function generateTelegramVoicePayload(chatId: number): TelegramWebhookPayload {
  return {
    update_id: Math.floor(10_000_000 + Math.random() * 90_000_000),
    message: makeTelegramMessage({
      chatId,
      userId: chatId,
      overrides: {
        voice: {
          file_id: fakeTelegramFileId(),
          file_unique_id: fakeTelegramFileUniqueId(),
          duration: Math.floor(5 + Math.random() * 55),
          mime_type: 'audio/ogg',
          file_size: 20000,
        },
      },
    }),
  };
}

export function generateTelegramCallbackQueryPayload(chatId: number): TelegramWebhookPayload {
  const user = makeTelegramUser(chatId);
  const message = makeTelegramMessage({ chatId, userId: chatId, overrides: { text: 'Menu principal' } });
  return {
    update_id: Math.floor(10_000_000 + Math.random() * 90_000_000),
    callback_query: {
      id: String(Math.floor(Math.random() * 1e15)),
      from: user,
      message,
      data: `action_${Math.random().toString(36).slice(2)}`,
    },
  };
}

export function generateTelegramRandomPayload(chatId: number): TelegramWebhookPayload {
  const generators = [
    () => generateTelegramTextPayload(chatId),
    () => generateTelegramPhotoPayload(chatId),
    () => generateTelegramDocumentPayload(chatId),
    () => generateTelegramVoicePayload(chatId),
    () => generateTelegramCallbackQueryPayload(chatId),
  ];
  return generators[Math.floor(Math.random() * generators.length)]();
}
