import { WhapiWebhookPayload } from '../interface/whapi-webhook.interface';

type WhapiMessageData = WhapiWebhookPayload['data'];

export function extractMessageContent(message: WhapiMessageData): string {
  const type = message.type ?? 'text';

  switch (type) {
    case 'text':
      return message.text?.body ?? '';

    case 'image':
      return message.image?.caption ?? '[image]';

    case 'audio':
      return '[audio]';

    case 'video':
      return message.video?.caption ?? '[video]';

    case 'document':
      return message.document?.filename ?? '[document]';

    default:
      return '[unsupported]';
  }
}
