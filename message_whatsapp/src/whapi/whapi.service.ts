import { Injectable, Logger } from "@nestjs/common";
import { WhapiMessage, WhapiText, WhapiWebhookPayload } from "./interface/whapi-webhook.interface";
import { DispatcherService } from "src/dispatcher/dispatcher.service";
import { WhatsappMessageService } from "src/whatsapp_message/whatsapp_message.service";
import { RealtimeService } from "src/realtime/realtime.service";

@Injectable()
export class WhapiService {
  private readonly logger = new Logger(WhapiService.name);

  constructor(
    private readonly dispatcherService: DispatcherService,
    private readonly whatsappMessageService: WhatsappMessageService,
    private readonly realtimeEmitter: RealtimeService,
  ) {}

  async handleIncomingMessage(payload: WhapiWebhookPayload): Promise<void> {
    const message = payload?.messages?.[0];
    if (!message || message.from_me) return;

    try {
      // 1️⃣ Assignation (agent ou pending)
      const conversation = await this.dispatcherService.assignConversation(
        this.mapWhapiMessage(message),
      );

      if (!conversation) {
        this.logger.warn(`⏳ Message en attente (${message.chat_id})`);
        return;
      }

      // 2️⃣ Persistance
      const savedMessage =
        await this.whatsappMessageService.saveIncomingFromWhapi(
          message,
          conversation,
        );

      // 3️⃣ Temps réel
      this.realtimeEmitter.emitIncomingMessage(
        conversation,
        savedMessage,
      );
    } catch (error) {
      this.logger.error('❌ Erreur webhook Whapi', error);
      throw error;
    }
  }

  async handleEvent(payload: WhapiWebhookPayload): Promise<void> {
    const event = payload?.event_datas?.[0];
    if (!event) return;

    if (event.event === 'composing') {
      const chatId = event.chat_id;
      // La documentation n'étant pas disponible, nous supposons que la payload
      // contient une propriété `composing` qui est un booléen.
      const state = event.composing ? 'start' : 'stop';
      this.realtimeEmitter.emitTypingEvent(chatId, state);
      this.logger.log(`✍️ Typing event [${state}] detected for chat ${chatId}`);
    }
  }

  async updateStatusMessage(payload: WhapiWebhookPayload): Promise<void> {
    if (!payload?.statuses?.length) return;

    for (const status of payload.statuses) {
      const updatedMessage =
        await this.whatsappMessageService.updateByStatus(status);

      if (updatedMessage) {
        this.realtimeEmitter.emitMessageStatusUpdate(
          updatedMessage.chat_id,
          updatedMessage.external_id,
          updatedMessage.status,
        );
        this.logger.log(
          `📌 Status update emitted | ${updatedMessage.external_id} → ${updatedMessage.status}`,
        );
      } else {
        this.logger.warn(`Message not found for status update: ${status.id}`);
      }
    }
  }

  // =========================
  // MAPPERS
  // =========================
  private mapWhapiMessage(message: WhapiMessage) {
    return {
      message_id: message.id,
      chat_id: message.chat_id,
      from: message.from,
      from_name: message.from_name,
      from_me: message.from_me,
      type: message.type,
      timestamp: message.timestamp,
      source: message.source,
      text: message.text as WhapiText,
    };
  }
}
