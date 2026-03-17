import { Injectable } from '@nestjs/common';
import {
  TelegramMessage,
  TelegramWebhookPayload,
} from 'src/whapi/interface/telegram-webhook.interface';
import {
  UnifiedMessage,
  UnifiedMessageType,
} from '../normalization/unified-message';
import { UnifiedStatus } from '../normalization/unified-status';
import { AdapterContext, ProviderAdapter } from './provider-adapter.interface';

@Injectable()
export class TelegramAdapter
  implements ProviderAdapter<TelegramWebhookPayload>
{
  normalizeMessages(
    payload: TelegramWebhookPayload,
    context: AdapterContext,
  ): UnifiedMessage[] {
    // Ignorer les channel_post (messages de canaux) et edited_message (V2)
    const message = payload.message;
    const callbackQuery = payload.callback_query;

    if (!message && !callbackQuery) return [];

    // V1 : conversations privées uniquement
    const effectiveMessage = message ?? callbackQuery?.message;
    if (!effectiveMessage) return [];
    if (effectiveMessage.chat.type !== 'private') return [];

    const unified = this.mapMessage(payload, context, effectiveMessage);
    return unified ? [unified] : [];
  }

  normalizeStatuses(
    _payload: TelegramWebhookPayload,
    _context: AdapterContext,
  ): UnifiedStatus[] {
    // Telegram Bot API ne fournit pas de delivery/read receipts
    return [];
  }

  private mapMessage(
    payload: TelegramWebhookPayload,
    context: AdapterContext,
    message: TelegramMessage,
  ): UnifiedMessage | null {
    const from = message.from ?? payload.callback_query?.from;
    if (!from) return null;

    const chatId = `${message.chat.id}@telegram`;
    const providerMessageId = payload.callback_query
      ? `cbq_${payload.callback_query.id}`
      : String(message.message_id);

    const fromName = [from.first_name, from.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || from.username;

    return {
      provider: context.provider,
      providerMessageId,
      tenantId: context.tenantId,
      channelId: context.channelId,
      chatId,
      from: String(from.id),
      fromName,
      timestamp: message.date,
      direction: 'in',
      type: this.mapType(payload, message),
      text: this.resolveText(payload, message),
      media: this.resolveMedia(message),
      location: this.resolveLocation(message),
      interactive: this.resolveInteractive(payload),
      quotedProviderMessageId: message.reply_to_message
        ? String(message.reply_to_message.message_id)
        : undefined,
      raw: payload,
    };
  }

  private mapType(
    payload: TelegramWebhookPayload,
    message: TelegramMessage,
  ): UnifiedMessageType {
    if (payload.callback_query) return 'interactive';
    if (message.photo) return 'image';
    if (message.video) return 'video';
    if (message.audio) return 'audio';
    if (message.voice) return 'voice';
    if (message.document) return 'document';
    if (message.sticker) return 'sticker';
    if (message.location) return 'location';
    if (message.contact) return 'unknown';
    if (message.text) return 'text';
    return 'unknown';
  }

  private resolveText(
    payload: TelegramWebhookPayload,
    message: TelegramMessage,
  ): string | undefined {
    if (payload.callback_query?.data) return payload.callback_query.data;
    return message.text ?? message.caption;
  }

  private resolveMedia(
    message: TelegramMessage,
  ): UnifiedMessage['media'] | undefined {
    // Pour Telegram, on stocke le file_id dans media.id
    // L'URL réelle est résolue via GET /getFile (lazy, à la demande)
    if (message.photo?.length) {
      const best = message.photo[message.photo.length - 1];
      return {
        id: best.file_id,
        fileSize: best.file_size,
      };
    }
    if (message.video) {
      return {
        id: message.video.file_id,
        mimeType: message.video.mime_type,
        fileSize: message.video.file_size,
        seconds: message.video.duration,
      };
    }
    if (message.audio) {
      return {
        id: message.audio.file_id,
        mimeType: message.audio.mime_type,
        fileSize: message.audio.file_size,
        seconds: message.audio.duration,
      };
    }
    if (message.voice) {
      return {
        id: message.voice.file_id,
        mimeType: message.voice.mime_type,
        fileSize: message.voice.file_size,
        seconds: message.voice.duration,
      };
    }
    if (message.document) {
      return {
        id: message.document.file_id,
        fileName: message.document.file_name,
        mimeType: message.document.mime_type,
        fileSize: message.document.file_size,
      };
    }
    if (message.sticker) {
      return {
        id: message.sticker.file_id,
        fileSize: message.sticker.file_size,
      };
    }
    return undefined;
  }

  private resolveLocation(
    message: TelegramMessage,
  ): UnifiedMessage['location'] | undefined {
    if (!message.location) return undefined;
    return {
      latitude: message.location.latitude,
      longitude: message.location.longitude,
    };
  }

  private resolveInteractive(
    payload: TelegramWebhookPayload,
  ): UnifiedMessage['interactive'] | undefined {
    if (!payload.callback_query) return undefined;
    return {
      kind: 'button_reply',
      id: payload.callback_query.data,
      title: payload.callback_query.data,
    };
  }
}
