import { WhapiWebhookPayload } from './payload.js';
import { generateMessage } from './generator.js';

export function generateWebhookPayload(chatId: string): WhapiWebhookPayload {
  return {
    messages: [generateMessage(chatId)],
    event: {
      type: 'messages',
      event: 'post',
    },
    channel_id: 'HULKBR-TCH5X',
  };
}
