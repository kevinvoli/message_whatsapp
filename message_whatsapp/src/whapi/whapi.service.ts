import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  WhapiMessage,
  WhapiWebhookPayload,
} from './interface/whapi-webhook.interface';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';

@Injectable()
export class WhapiService {
  private readonly logger = new Logger(WhapiService.name);

  constructor(
    private readonly dispatcherService: DispatcherService,
    private readonly whatsappMessageService: WhatsappMessageService,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,
  ) {}

  async handleIncomingMessage(payload: WhapiWebhookPayload): Promise<void> {
    if (!payload?.messages?.length) return;

    const message = payload.messages[0];

    // 🔒 ignorer les messages envoyés par ton propre compte
    if (message.from_me) return;

    const content = this.extractMessageContent(message);
    const messageType = message.type;
    const mediaUrl =
      message.image?.id ||
      message.video?.id ||
      message.audio?.id ||
      message.document?.id ||
      null;

    // 1️⃣ Dispatcher (assignation agent ou pending)
    const conversation = await this.dispatcherService.assignConversation(
      message.chat_id,
      message.from_name ?? 'Client',
      content,
      messageType,
      mediaUrl ?? undefined,
    );

    if (!conversation) {
      this.logger.warn(
        `⏳ Aucun agent disponible, message mis en attente (${message.chat_id})`,
      );
      return;
    }

    // 2️⃣ Sauvegarde en base
    const savedMessage =
      await this.whatsappMessageService.saveIncomingFromWhapi(
        message,
        conversation,
      );

    // 3️⃣ Temps réel (WebSocket)
    this.messageGateway.emitIncomingMessage(
      conversation.chat_id,
      savedMessage,
    );
  }

  async updateStatusMessage(payload: WhapiWebhookPayload): Promise<void> {
    if (!payload?.statuses?.length) return;

    for (const status of payload.statuses) {
      await this.whatsappMessageService.updateByStatus(status);

      this.logger.log(
        `📌 Status update | msg=${status.id} | ${status.status}`,
      );
    }
  }

  // =========================
  // UTIL
  // =========================
  private extractMessageContent(message: WhapiMessage): string {
    switch (message.type) {
      case 'text':
        return message.text?.body ?? '';
      case 'image':
        return message.image?.caption ?? '[Image]';
      case 'video':
        return message.video?.caption ?? '[Vidéo]';
      case 'audio':
        return '[Audio]';
      case 'document':
        return message.document?.filename ?? '[Document]';
      default:
        return '[Message non supporté]';
    }
  }
}
