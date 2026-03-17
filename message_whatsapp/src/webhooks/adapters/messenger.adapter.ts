import { Injectable } from '@nestjs/common';
import {
  MessengerMessaging,
  MessengerWebhookPayload,
} from 'src/whapi/interface/messenger-webhook.interface';
import {
  UnifiedMessage,
  UnifiedMessageType,
} from '../normalization/unified-message';
import { UnifiedStatus } from '../normalization/unified-status';
import { AdapterContext, ProviderAdapter } from './provider-adapter.interface';

@Injectable()
export class MessengerAdapter
  implements ProviderAdapter<MessengerWebhookPayload>
{
  normalizeMessages(
    payload: MessengerWebhookPayload,
    context: AdapterContext,
  ): UnifiedMessage[] {
    const messages: UnifiedMessage[] = [];
    for (const entry of payload.entry ?? []) {
      const pageId = entry.id;
      for (const messaging of entry.messaging ?? []) {
        if (!messaging.message) continue;
        // Ignorer les delivery/read events (pas de message.mid de contenu)
        if (messaging.delivery || messaging.read) continue;
        messages.push(
          this.mapMessage(messaging, context, pageId, payload),
        );
      }
    }
    return messages;
  }

  normalizeStatuses(
    payload: MessengerWebhookPayload,
    context: AdapterContext,
  ): UnifiedStatus[] {
    const statuses: UnifiedStatus[] = [];
    for (const entry of payload.entry ?? []) {
      for (const messaging of entry.messaging ?? []) {
        if (messaging.delivery) {
          for (const mid of messaging.delivery.mids ?? []) {
            statuses.push({
              provider: context.provider,
              providerMessageId: mid,
              tenantId: context.tenantId,
              channelId: context.channelId,
              recipientId: messaging.sender.id,
              status: 'delivered',
              timestamp: Math.floor(messaging.timestamp / 1000),
              raw: payload,
            });
          }
        }
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
    messaging: MessengerMessaging,
    context: AdapterContext,
    pageId: string,
    raw: MessengerWebhookPayload,
  ): UnifiedMessage {
    const message = messaging.message!;
    const isOutbound = messaging.sender.id === pageId;
    const chatId = `${messaging.sender.id}@messenger`;
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
      interactive: this.resolveInteractive(messaging),
      quotedProviderMessageId: message.reply_to?.mid,
      raw,
    };
  }

  private mapType(messaging: MessengerMessaging): UnifiedMessageType {
    const message = messaging.message!;

    if (messaging.postback) return 'interactive';
    if (message.quick_reply) return 'interactive';

    if (message.sticker_id) return 'sticker';

    if (message.attachments?.length) {
      const type = message.attachments[0].type;
      switch (type) {
        case 'image':
          return 'image';
        case 'video':
          return 'video';
        case 'audio':
          return 'audio';
        case 'file':
          return 'document';
        default:
          return 'unknown';
      }
    }

    if (message.text) return 'text';
    return 'unknown';
  }

  private resolveText(messaging: MessengerMessaging): string | undefined {
    if (messaging.postback) return messaging.postback.title;
    if (messaging.message?.quick_reply) return messaging.message.text;
    return messaging.message?.text;
  }

  private resolveMedia(
    message: MessengerMessaging['message'],
  ): UnifiedMessage['media'] | undefined {
    if (!message?.attachments?.length) return undefined;
    const attachment = message.attachments[0];
    if (!attachment.payload?.url) return undefined;
    return {
      id: message.mid,
      link: attachment.payload.url,
    };
  }

  private resolveInteractive(
    messaging: MessengerMessaging,
  ): UnifiedMessage['interactive'] | undefined {
    if (messaging.postback) {
      return {
        kind: 'button_reply',
        id: messaging.postback.payload,
        title: messaging.postback.title,
      };
    }
    if (messaging.message?.quick_reply) {
      return {
        kind: 'button_reply',
        id: messaging.message.quick_reply.payload,
        title: messaging.message.quick_reply.title,
      };
    }
    return undefined;
  }
}
