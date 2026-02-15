import { Injectable } from '@nestjs/common';
import {
  WhapiMessage,
  WhapiWebhookPayload,
  WhapiStatus,
} from 'src/whapi/interface/whapi-webhook.interface';
import {
  UnifiedMessage,
  UnifiedMessageType,
} from '../normalization/unified-message';
import { UnifiedStatus } from '../normalization/unified-status';
import { AdapterContext, ProviderAdapter } from './provider-adapter.interface';

@Injectable()
export class WhapiAdapter implements ProviderAdapter<WhapiWebhookPayload> {
  normalizeMessages(
    payload: WhapiWebhookPayload,
    context: AdapterContext,
  ): UnifiedMessage[] {
    const messages = payload.messages ?? [];
    return messages.map((message) =>
      this.mapMessage(message, context, payload),
    );
  }

  normalizeStatuses(
    payload: WhapiWebhookPayload,
    context: AdapterContext,
  ): UnifiedStatus[] {
    const statuses = payload.statuses ?? [];
    return statuses.map((status) => this.mapStatus(status, context, payload));
  }

  private mapMessage(
    message: WhapiMessage,
    context: AdapterContext,
    raw: WhapiWebhookPayload,
  ): UnifiedMessage {
    return {
      provider: context.provider,
      providerMessageId: message.id,
      tenantId: context.tenantId,
      channelId: context.channelId,
      chatId: message.chat_id,
      from: message.from,
      fromName: message.from_name,
      timestamp: message.timestamp,
      direction: message.from_me ? 'out' : 'in',
      type: this.mapType(message.type),
      text: this.resolveText(message),
      media: this.resolveMedia(message),
      location: message.location
        ? {
            latitude: message.location.latitude,
            longitude: message.location.longitude,
            name: message.location.name,
            address: message.location.address,
          }
        : undefined,
      interactive: this.resolveInteractive(message),
      raw,
    };
  }

  private mapStatus(
    status: WhapiStatus,
    context: AdapterContext,
    raw: WhapiWebhookPayload,
  ): UnifiedStatus {
    return {
      provider: context.provider,
      providerMessageId: status.id,
      tenantId: context.tenantId,
      channelId: context.channelId,
      recipientId: status.recipient_id,
      status: status.status,
      timestamp: Number(status.timestamp),
      errorCode: status.status === 'failed' ? status.code : undefined,
      errorTitle:
        status.status === 'failed' && status.code
          ? `whapi_error_${status.code}`
          : undefined,
      raw,
    };
  }

  private mapType(type: string): UnifiedMessageType {
    switch (type) {
      case 'text':
      case 'image':
      case 'video':
      case 'gif':
      case 'short':
      case 'audio':
      case 'voice':
      case 'document':
      case 'sticker':
      case 'location':
      case 'live_location':
      case 'interactive':
        return type as UnifiedMessageType;
      case 'list':
      case 'buttons':
        return 'interactive';
      case 'reaction':
        return 'unknown';
      default:
        return type as UnifiedMessageType;
    }
  }

  private resolveText(message: WhapiMessage): string | undefined {
    if (typeof message.text === 'string') {
      return message.text;
    }
    if (message.text?.body) {
      return message.text.body;
    }
    switch (message.type) {
      case 'image':
        return message.image?.caption ?? undefined;
      case 'video':
      case 'gif':
      case 'short':
        return message.video?.caption ?? undefined;
      case 'document':
        return message.document?.filename ?? undefined;
      default:
        return undefined;
    }
  }

  private resolveMedia(message: WhapiMessage):
    | {
        id: string;
        mimeType?: string;
        fileName?: string;
        fileSize?: number;
        caption?: string;
        sha256?: string;
      }
    | undefined {
    if (message.image) {
      return {
        id: message.image.id,
        mimeType: message.image.mime_type,
        fileSize: message.image.file_size,
        caption: message.image.caption,
        sha256: message.image.sha256,
      };
    }
    if (message.video) {
      return {
        id: message.video.id,
        mimeType: message.video.mime_type,
        fileSize: message.video.file_size,
        caption: message.video.caption,
        sha256: message.video.sha256,
      };
    }
    if (message.audio) {
      return {
        id: message.audio.id,
        mimeType: message.audio.mime_type,
        fileSize: message.audio.file_size,
        sha256: message.audio.sha256,
      };
    }
    if (message.voice) {
      return {
        id: message.voice.id,
        mimeType: message.voice.mime_type,
        fileSize: message.voice.file_size,
        sha256: message.voice.sha256,
      };
    }
    if (message.document) {
      return {
        id: message.document.id,
        mimeType: message.document.mime_type,
        fileName: message.document.filename,
        fileSize: message.document.file_size,
        sha256: message.document.sha256,
      };
    }
    if (message.sticker) {
      return {
        id: message.sticker.id,
        mimeType: message.sticker.mime_type,
        fileSize: message.sticker.file_size,
        sha256: message.sticker.sha256,
      };
    }
    return undefined;
  }

  private resolveInteractive(
    message: WhapiMessage,
  ):
    | { kind: 'button_reply' | 'list_reply' | 'unknown'; id?: string; title?: string; description?: string }
    | undefined {
    // Whapi reply format: { type: "reply", reply: { type: "buttons_reply", buttons_reply: { id, title } } }
    if (message.reply) {
      if (message.reply.type === 'buttons_reply' && message.reply.buttons_reply) {
        return {
          kind: 'button_reply',
          id: message.reply.buttons_reply.id,
          title: message.reply.buttons_reply.title,
        };
      }
      if (message.reply.type === 'list_reply' && message.reply.list_reply) {
        return {
          kind: 'list_reply',
          id: message.reply.list_reply.id,
          title: message.reply.list_reply.title,
          description: message.reply.list_reply.description,
        };
      }
      return { kind: 'unknown' };
    }

    return undefined;
  }
}
