import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { WhapiWebhookPayload } from './interface/whapi-webhook.interface';
import { MetaWebhookPayload } from './interface/whatsapp-whebhook.interface';
import { MessengerWebhookPayload } from './interface/messenger-webhook.interface';
import { InstagramWebhookPayload } from './interface/instagram-webhook.interface';

/**
 * Validation structurelle des payloads webhook entrants.
 *
 * Extrait du WhapiController (Phase B3) pour être testable isolément.
 */
@Injectable()
export class WebhookPayloadValidationService {
  assertWhapiPayload(payload: WhapiWebhookPayload): void {
    if (!payload || typeof payload !== 'object') {
      throw new HttpException('Invalid payload', HttpStatus.BAD_REQUEST);
    }
    if (!payload.channel_id || typeof payload.channel_id !== 'string') {
      throw new HttpException('Invalid channel_id', HttpStatus.BAD_REQUEST);
    }
    if (!payload.event || typeof payload.event.type !== 'string') {
      throw new HttpException('Invalid event', HttpStatus.BAD_REQUEST);
    }
    const hasMessages = Array.isArray(payload.messages);
    const hasStatuses = Array.isArray(payload.statuses);
    if (!hasMessages && !hasStatuses) {
      throw new HttpException(
        'Missing messages/statuses',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (hasMessages) {
      for (const message of payload.messages ?? []) {
        if (!message?.id || typeof message.id !== 'string') {
          throw new HttpException('Invalid message id', HttpStatus.BAD_REQUEST);
        }
        if (!message.chat_id || typeof message.chat_id !== 'string') {
          throw new HttpException('Invalid chat_id', HttpStatus.BAD_REQUEST);
        }
        if (!message.type || typeof message.type !== 'string') {
          throw new HttpException(
            'Invalid message type',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
    if (hasStatuses) {
      for (const status of payload.statuses ?? []) {
        if (!status?.id || typeof status.id !== 'string') {
          throw new HttpException('Invalid status id', HttpStatus.BAD_REQUEST);
        }
        if (!status.recipient_id || typeof status.recipient_id !== 'string') {
          throw new HttpException(
            'Invalid recipient_id',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
  }

  assertMetaPayload(payload: unknown): MetaWebhookPayload {
    if (!payload || typeof payload !== 'object') {
      throw new HttpException('Invalid payload', HttpStatus.BAD_REQUEST);
    }
    const metaPayload = payload as MetaWebhookPayload;
    if (metaPayload.object !== 'whatsapp_business_account') {
      throw new HttpException('Invalid meta object', HttpStatus.BAD_REQUEST);
    }
    const entry = metaPayload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const metadata = value?.metadata;
    if (!entry?.id || typeof entry.id !== 'string') {
      throw new HttpException('Invalid entry id', HttpStatus.BAD_REQUEST);
    }
    if (
      !metadata?.phone_number_id ||
      typeof metadata.phone_number_id !== 'string'
    ) {
      throw new HttpException(
        'Invalid phone_number_id',
        HttpStatus.BAD_REQUEST,
      );
    }
    const hasMessages = Array.isArray(value?.messages);
    const hasStatuses = Array.isArray(value?.statuses);
    if (!hasMessages && !hasStatuses) {
      throw new HttpException(
        'Missing messages/statuses',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (hasMessages) {
      for (const message of value?.messages ?? []) {
        if (!message?.id || typeof message.id !== 'string') {
          throw new HttpException('Invalid message id', HttpStatus.BAD_REQUEST);
        }
        if (!message?.from || typeof message.from !== 'string') {
          throw new HttpException(
            'Invalid message from',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
    if (hasStatuses) {
      for (const status of value?.statuses ?? []) {
        if (!status?.id || typeof status.id !== 'string') {
          throw new HttpException('Invalid status id', HttpStatus.BAD_REQUEST);
        }
        if (!status?.recipient_id || typeof status.recipient_id !== 'string') {
          throw new HttpException(
            'Invalid recipient_id',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
    return metaPayload;
  }

  assertInstagramPayload(payload: unknown): InstagramWebhookPayload {
    if (!payload || typeof payload !== 'object') {
      throw new HttpException('Invalid payload', HttpStatus.BAD_REQUEST);
    }
    const p = payload as InstagramWebhookPayload;
    if (p.object !== 'instagram') {
      throw new HttpException(
        'Not an Instagram event',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!Array.isArray(p.entry) || p.entry.length === 0) {
      throw new HttpException('Missing entry', HttpStatus.BAD_REQUEST);
    }
    return p;
  }

  assertMessengerPayload(payload: unknown): MessengerWebhookPayload {
    if (!payload || typeof payload !== 'object') {
      throw new HttpException('Invalid payload', HttpStatus.BAD_REQUEST);
    }
    const p = payload as MessengerWebhookPayload;
    if (p.object !== 'page') {
      throw new HttpException(
        'Not a Messenger page event',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!Array.isArray(p.entry) || p.entry.length === 0) {
      throw new HttpException('Missing entry', HttpStatus.BAD_REQUEST);
    }
    return p;
  }
}
