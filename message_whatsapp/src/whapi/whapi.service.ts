// whapi.service.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  WhapiMessage,
  WhapiWebhookPayload,
} from './interface/whapi-webhook.interface';
import { WhapiServiceDispacher } from './whatsapp_dispacher.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';

@Injectable()
export class WhapiService {
  private readonly logger = new Logger(WhapiService.name);

  constructor(
    private readonly whatsappDispacherService: WhapiServiceDispacher,
    private readonly whatsappMessageService: WhatsappMessageService,
  ) {}

  async handleIncomingMessage(payload: WhapiWebhookPayload) {
    if (!payload) return;
    if (payload.messages?.[0]) {
      const message = payload.messages[0];
      const chatId = message.chat_id;
      await this.whatsappDispacherService.sendMessage(chatId, message);
    }
  }

  async updateStatusMessage(payload: WhapiWebhookPayload) {
    try {
      if (!payload || !payload.statuses) return;
      for (const status of payload.statuses) {
        await this.whatsappMessageService.updateByStatus(status);

        this.logger.log(
          `[Status] Message: ${status.id}, Recipient: ${status.recipient_id}, Status: ${status.status}`,
        );
      }
    } catch (error) {
      this.logger.error(`Error updating message status: ${error}`);
    }
  }

  //   {
  //   id: 'rAF3nNMHa2sRk6WF4BgqbA-hWHCtSkAsFM',
  //   code: 4,
  //   status: 'read',
  //   recipient_id: '214083332780115@lid',
  //   timestamp: '1768305745'
  // }

  private extractMessageContent(message: WhapiMessage): string {
    switch (message.type) {
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
}
