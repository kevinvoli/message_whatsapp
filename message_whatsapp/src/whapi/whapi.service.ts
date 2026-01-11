// whapi.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { WhapiMessage, WhapiWebhookPayload } from './interface/whapi-webhook.interface';


@Injectable()
export class WhapiService {
  private readonly logger = new Logger(WhapiService.name);

   handleIncomingMessage(payload: WhapiWebhookPayload) {
    if (!payload) return;

    // --- Messages ---
    if (payload.messages?.length) {
      for (const message of payload.messages) {
        if (message.from_me) continue;

        const chatId = message.chat_id;
        const timestamp = message.timestamp;
        const content =  this.extractMessageContent(message);

        this.logger.log(`[Message] Chat: ${chatId}, Timestamp: ${timestamp}, Content: ${content}`);
      }
    }

    // --- Statuses ---
    if (payload.statuses?.length) {
      for (const status of payload.statuses) {
        this.logger.log(`[Status] Message: ${status.id}, Recipient: ${status.recipient_id}, Status: ${status.status}`);
      }
    }

    // --- Polls ---
    if (payload.polls?.length) {
      for (const poll of payload.polls) {
        this.logger.log(`[Poll] Title: ${poll.title}, Options: ${poll.options.join(', ')}`);
      }
    }

    // --- Interactive (list, buttons, product) ---
    if (payload.interactives?.length) {
      for (const interactive of payload.interactives) {
        this.logger.log(`[Interactive] Type: ${interactive.type}, Body: ${interactive.body?.text}`);
      }
    }

    // --- HSM (Highly Structured Messages) ---
    if (payload.hsms?.length) {
      for (const hsm of payload.hsms) {
        this.logger.log(`[HSM] Header: ${hsm.header?.text?.body}, Body: ${hsm.body}, Footer: ${hsm.footer}`);
      }
    }

    // --- Catalogs ---
    if (payload.catalogs?.length) {
      for (const catalog of payload.catalogs) {
        this.logger.log(`[Catalog] Title: ${catalog.title}, ID: ${catalog.catalog_id}`);
      }
    }

    // --- Orders ---
    if (payload.orders?.length) {
      for (const order of payload.orders) {
        this.logger.log(`[Order] Title: ${order.title}, Status: ${order.status}, Total: ${order.total_price}`);
      }
    }

    // --- Invites (group, newsletter, admin) ---
    if (payload.invites?.length) {
      for (const invite of payload.invites) {
        this.logger.log(`[Invite] Type: ${invite.title}, Body: ${invite.body}, Link: ${invite.link}`);
      }
    }
  }

  private extractMessageContent(message: WhapiMessage): string {
    switch (message.type) {
      case 'text': return message.text?.body ?? '';
      case 'image': return message.image?.caption ?? '[image]';
      case 'audio': return '[audio]';
      case 'video': return message.video?.caption ?? '[video]';
      case 'document': return message.document?.filename ?? '[document]';
      default: return '[unsupported]';
    }
  }
}
