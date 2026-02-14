import { WhapiWebhookPayload, MetaWebhookPayload } from './payload.js';
import { generateMessage, generateMetaPayload } from './generator.js';
import { config } from './config.js';

export function generateWebhookPayload(chatId: string): WhapiWebhookPayload {
  return {
    messages: [generateMessage(chatId)],
    event: {
      type: 'messages',
      event: 'post',
    },
    channel_id: config.channelId,
  };
}

export function generateMetaWebhookPayload(params: {
  from: string;
  name: string;
  messageId: string;
  body: string;
}): MetaWebhookPayload {
  return generateMetaPayload({
    phoneNumberId: config.metaPhoneNumberId,
    wabaId: config.metaWabaId,
    from: params.from,
    name: params.name,
    messageId: params.messageId,
    body: params.body,
  });
}
