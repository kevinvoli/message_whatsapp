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

  async updateStatusMessage(payload: WhapiWebhookPayload): Promise<void> {
    if (!payload?.statuses?.length) return;

    for (const status of payload.statuses) {
      await this.whatsappMessageService.updateByStatus(status);
      this.logger.log(`📌 Status update | ${status.id} → ${status.status}`);
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
