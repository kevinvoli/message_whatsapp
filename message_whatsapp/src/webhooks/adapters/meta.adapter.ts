import { Injectable } from '@nestjs/common';
import {
  MetaMessage,
  MetaWebhookPayload,
  MetaStatus,
} from 'src/whapi/interface/whatsapp-whebhook.interface';
import {
  UnifiedMessage,
  UnifiedMessageType,
} from '../normalization/unified-message';
import { UnifiedStatus } from '../normalization/unified-status';
import { AdapterContext, ProviderAdapter } from './provider-adapter.interface';

@Injectable()
export class MetaAdapter implements ProviderAdapter<MetaWebhookPayload> {
  normalizeMessages(
    payload: MetaWebhookPayload,
    context: AdapterContext,
  ): UnifiedMessage[] {
    const messages: UnifiedMessage[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const channelId = value?.metadata?.phone_number_id ?? context.channelId;
        const contacts = value?.contacts ?? [];
        const contactName = contacts[0]?.profile?.name;
        for (const message of value?.messages ?? []) {
          messages.push(
            this.mapMessage(message, context, channelId, contactName, payload),
          );
        }
      }
    }
    return messages;
  }

  normalizeStatuses(
    payload: MetaWebhookPayload,
    context: AdapterContext,
  ): UnifiedStatus[] {
    const statuses: UnifiedStatus[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const channelId = value?.metadata?.phone_number_id ?? context.channelId;
        for (const status of value?.statuses ?? []) {
          statuses.push(this.mapStatus(status, context, channelId, payload));
        }
      }
    }
    return statuses;
  }

  private mapMessage(
    message: MetaMessage,
    context: AdapterContext,
    channelId: string,
    contactName: string | undefined,
    raw: MetaWebhookPayload,
  ): UnifiedMessage {
    const type = this.mapType(message.type);
    const chatId = `${message.from}@s.whatsapp.net`;
    const timestamp = Number.parseInt(message.timestamp, 10);
    return {
      provider: context.provider,
      providerMessageId: message.id,
      tenantId: context.tenantId,
      channelId,
      chatId,
      from: message.from,
      fromName: contactName,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now() / 1000,
      direction: 'in',
      type,
      text: this.resolveText(message),
      media: this.resolveMedia(message),
      location: this.resolveLocation(message),
      interactive: this.resolveInteractive(message),
      raw,
    };
  }

  private mapStatus(
    status: MetaStatus,
    context: AdapterContext,
    channelId: string,
    raw: MetaWebhookPayload,
  ): UnifiedStatus {
    const timestamp = Number.parseInt(status.timestamp, 10);
    const firstError = status.errors?.[0];
    return {
      provider: context.provider,
      providerMessageId: status.id,
      tenantId: context.tenantId,
      channelId,
      recipientId: status.recipient_id,
      status: status.status,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now() / 1000,
      errorCode: firstError?.code,
      errorTitle: firstError?.title,
      raw,
    };
  }

  private mapType(type: string): UnifiedMessageType {
    switch (type) {
      case 'text':
      case 'image':
      case 'audio':
      case 'video':
      case 'document':
      case 'location':
      case 'interactive':
        return type;
      case 'button':
        return 'interactive';
      default:
        return 'unknown';
    }
  }

  private resolveText(message: MetaMessage): string | undefined {
    if (message.type === 'text') {
      return message.text?.body;
    }
    if (message.type === 'button') {
      return message.button?.text;
    }
    if (message.type === 'document') {
      return message.document?.filename;
    }
    if (message.type === 'image') {
      return message.image?.caption;
    }
    if (message.type === 'video') {
      return message.video?.caption;
    }
    return undefined;
  }

  private resolveMedia(message: MetaMessage):
    | {
        id: string;
        mimeType?: string;
        fileName?: string;
        fileSize?: number;
        caption?: string;
        sha256?: string;
        link?: string;
      }
    | undefined {
    if (message.type === 'image') {
      return {
        id: message.image.id,
        mimeType: message.image.mime_type,
        caption: message.image.caption,
        sha256: message.image.sha256,
        link: message.image.url,
      };
    }
    if (message.type === 'video') {
      return {
        id: message.video.id,
        mimeType: message.video.mime_type,
        caption: message.video.caption,
        sha256: message.video.sha256,
        link: message.video.url,
      };
    }
    if (message.type === 'audio') {
      return {
        id: message.audio.id,
        mimeType: message.audio.mime_type,
        sha256: message.audio.sha256,
        link: message.audio.url,
      };
    }
    if (message.type === 'document') {
      return {
        id: message.document.id,
        mimeType: message.document.mime_type,
        fileName: message.document.filename,
        sha256: message.document.sha256,
        link: message.document.url,
      };
    }
    return undefined;
  }

  private resolveLocation(
    message: MetaMessage,
  ):
    | { latitude: number; longitude: number; name?: string; address?: string }
    | undefined {
    if (message.type !== 'location') {
      return undefined;
    }
    return {
      latitude: message.location.latitude,
      longitude: message.location.longitude,
      name: message.location.name,
      address: message.location.address,
    };
  }

  private resolveInteractive(message: MetaMessage):
    | {
        kind: 'button_reply' | 'list_reply' | 'unknown';
        id?: string;
        title?: string;
        description?: string;
      }
    | undefined {
    if (message.type === 'interactive') {
      if (message.interactive.type === 'button_reply') {
        return {
          kind: 'button_reply',
          id: message.interactive.button_reply?.id,
          title: message.interactive.button_reply?.title,
        };
      }
      if (message.interactive.type === 'list_reply') {
        return {
          kind: 'list_reply',
          id: message.interactive.list_reply?.id,
          title: message.interactive.list_reply?.title,
          description: message.interactive.list_reply?.description,
        };
      }
      return { kind: 'unknown' };
    }
    if (message.type === 'button') {
      return {
        kind: 'button_reply',
        id: message.button.payload,
        title: message.button.text,
      };
    }
    return undefined;
  }
}
