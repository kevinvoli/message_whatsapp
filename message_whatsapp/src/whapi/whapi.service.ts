// whapi.service.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  WhapiMessage,
  WhapiWebhookPayload,
} from './interface/whapi-webhook.interface';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';

@Injectable()
export class WhapiService {
  private readonly logger = new Logger(WhapiService.name);

  constructor(
    private readonly dispatcherService: DispatcherService,
    private readonly whatsappMessageService: WhatsappMessageService,
  ) {}

  async handleIncomingMessage(payload: WhapiWebhookPayload) {
    if (!payload || !payload.messages || payload.messages.length === 0) {
      return;
    }

    const message = payload.messages[0];
    if (message.from_me) return; // Ignore messages sent by the business account itself

    const content = this.extractMessageContent(message);
    const mediaUrl = message.image?.id || message.video?.id || message.document?.id;

    await this.dispatcherService.assignConversation(
      message.chat_id,
      message.from_name,
      content,
      message.type,
      mediaUrl,
    );
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
