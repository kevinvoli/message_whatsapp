import { Injectable } from '@nestjs/common';
import {
  InstagramMessaging,
  InstagramWebhookPayload,
} from 'src/whapi/interface/instagram-webhook.interface';
import {
  UnifiedMessage,
  UnifiedMessageType,
} from '../normalization/unified-message';
import { UnifiedStatus } from '../normalization/unified-status';
import { AdapterContext, ProviderAdapter } from './provider-adapter.interface';

@Injectable()
export class InstagramAdapter
  implements ProviderAdapter<InstagramWebhookPayload>
{
  normalizeMessages(
    payload: InstagramWebhookPayload,
    context: AdapterContext,
  ): UnifiedMessage[] {
    const messages: UnifiedMessage[] = [];
    for (const entry of payload.entry ?? []) {
      const igAccountId = entry.id;
      for (const messaging of entry.messaging ?? []) {
        if (!messaging.message) continue;
        // Ignorer les read receipts, messages supprimés et non supportés
        if (messaging.read) continue;
        if (messaging.message.is_deleted) continue;
        if (messaging.message.is_unsupported) continue;
        // Ignorer les réactions (pas de type unifié pour l'instant)
        if (messaging.message.reactions) continue;

        messages.push(
          this.mapMessage(messaging, context, igAccountId, payload),
        );
      }
    }
    return messages;
  }

  normalizeStatuses(
    payload: InstagramWebhookPayload,
    context: AdapterContext,
  ): UnifiedStatus[] {
    const statuses: UnifiedStatus[] = [];
    for (const entry of payload.entry ?? []) {
      for (const messaging of entry.messaging ?? []) {
        if (messaging.read) {
          statuses.push({
            provider: context.provider,
            providerMessageId: `read_watermark_${messaging.read.watermark}`,
            tenantId: context.tenantId,
            channelId: context.channelId,
            recipientId: messaging.sender.id,
            status: 'read',
            timestamp: Math.floor(messaging.timestamp / 1000),
            raw: payload,
          });
        }
      }
    }
    return statuses;
  }

  private mapMessage(
    messaging: InstagramMessaging,
    context: AdapterContext,
    igAccountId: string,
    raw: InstagramWebhookPayload,
  ): UnifiedMessage {
    const message = messaging.message!;
    const isOutbound = messaging.sender.id === igAccountId;
    const chatId = `${messaging.sender.id}@instagram`;
    const timestamp = Math.floor(messaging.timestamp / 1000);

    return {
      provider: context.provider,
      providerMessageId: message.mid,
      tenantId: context.tenantId,
      channelId: context.channelId,
      chatId,
      from: messaging.sender.id,
      timestamp,
      direction: isOutbound ? 'out' : 'in',
      type: this.mapType(messaging),
      text: this.resolveText(messaging),
      media: this.resolveMedia(message),
      quotedProviderMessageId: message.reply_to?.mid,
      raw,
    };
  }

  private mapType(messaging: InstagramMessaging): UnifiedMessageType {
    const message = messaging.message!;

    if (message.attachments?.length) {
      const type = message.attachments[0].type;
      switch (type) {
        case 'image':
          return 'image';
        case 'video':
        case 'ig_reel':
        case 'reel':
          return 'video';
        case 'audio':
          return 'audio';
        case 'file':
          return 'document';
        case 'story_mention':
        case 'share':
        case 'fallback':
        default:
          return 'unknown';
      }
    }

    if (message.text) return 'text';
    return 'unknown';
  }

  private resolveText(messaging: InstagramMessaging): string | undefined {
    return messaging.message?.text;
  }

  private resolveMedia(
    message: InstagramMessaging['message'],
  ): UnifiedMessage['media'] | undefined {
    if (!message?.attachments?.length) return undefined;
    const attachment = message.attachments[0];
    // Ignorer story_mention et share (pas d'URL exploitable facilement)
    if (
      attachment.type === 'story_mention' ||
      attachment.type === 'share' ||
      attachment.type === 'fallback'
    ) {
      return undefined;
    }
    if (!attachment.payload?.url) return undefined;
    return {
      id: message.mid,
      link: attachment.payload.url,
    };
  }
}
