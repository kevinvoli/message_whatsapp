import { WhapiWebhookPayload, MetaWebhookPayload } from './payload.js';
import {
  generateMessage,
  generateRandomWhapiMessage,
  generateWhapiStatus,
  generateMetaPayload,
  generateMetaMediaMessage,
  generateMetaInteractiveMessage,
  generateMetaStatusPayload,
} from './generator.js';
import { config } from './config.js';

// ============================================================
// Whapi payloads
// ============================================================

export function generateWhapiMessagePayload(chatId: string): WhapiWebhookPayload {
  return {
    messages: [generateMessage(chatId)],
    event: { type: 'messages', event: 'post' },
    channel_id: config.channelId,
  };
}

export function generateWhapiRandomMessagePayload(chatId: string): WhapiWebhookPayload {
  return {
    messages: [generateRandomWhapiMessage(chatId)],
    event: { type: 'messages', event: 'post' },
    channel_id: config.channelId,
  };
}

export function generateWhapiStatusPayload(chatId: string, messageId?: string): WhapiWebhookPayload {
  return {
    statuses: [generateWhapiStatus(chatId, messageId)],
    event: { type: 'statuses', event: 'patch' },
    channel_id: config.channelId,
  };
}

// ============================================================
// Meta payloads
// ============================================================

export function generateMetaWebhookPayload(params: {
  from: string;
  name: string;
  messageId: string;
  body: string;
  omitContact?: boolean;
}): MetaWebhookPayload {
  return generateMetaPayload({
    phoneNumberId: config.metaPhoneNumberId,
    wabaId: config.metaWabaId,
    from: params.from,
    name: params.name,
    messageId: params.messageId,
    body: params.body,
    omitContact: params.omitContact,
  });
}

export function generateMetaRandomMessagePayload(from: string, name: string): MetaWebhookPayload {
  const types = ['text', 'image', 'video', 'audio', 'document', 'interactive'] as const;
  const type = types[Math.floor(Math.random() * types.length)];

  if (type === 'interactive') {
    return generateMetaInteractiveMessage({
      phoneNumberId: config.metaPhoneNumberId,
      wabaId: config.metaWabaId,
      from,
      name,
    });
  }

  if (type === 'text') {
    return generateMetaWebhookPayload({
      from,
      name,
      messageId: `wamid.${Date.now()}-${Math.random().toString(16).slice(2)}`,
      body: `Message de test ${Math.random().toString(36).slice(2)}`,
    });
  }

  return generateMetaMediaMessage({
    phoneNumberId: config.metaPhoneNumberId,
    wabaId: config.metaWabaId,
    from,
    name,
    type: type as 'image' | 'video' | 'audio' | 'document',
  });
}

export function generateMetaStatusWebhookPayload(recipientId: string, messageId?: string): MetaWebhookPayload {
  return generateMetaStatusPayload({
    phoneNumberId: config.metaPhoneNumberId,
    wabaId: config.metaWabaId,
    recipientId,
    messageId,
  });
}

// ============================================================
// Backward compatibility alias
// ============================================================

/** @deprecated Use generateWhapiMessagePayload */
export const generateWebhookPayload = generateWhapiMessagePayload;
