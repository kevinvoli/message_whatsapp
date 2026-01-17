import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import {
  WhapiMessage,
  WhapiWebhookPayload,
} from './interface/whapi-webhook.interface';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { NotFoundError } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@Injectable()
export class WhapiService {
  private readonly logger = new Logger(WhapiService.name);

  constructor(
    private readonly dispatcherService: DispatcherService,
    private readonly whatsappMessageService: WhatsappMessageService,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,
          @InjectRepository(WhatsappChat)
        private readonly chatRepository: Repository<WhatsappChat>,
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

    try {
      //  1️⃣ Dispatcher (assignation agent ou pending)
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

      console.log("kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk_______________________________rrrrrrrrrrrrrrrrrrrrr",conversation);
      

      // 2️⃣ Sauvegarde en base
      const savedMessage =
        await this.whatsappMessageService.saveIncomingFromWhapi(
          message,
          conversation,
        );


      if (!conversation.chat_id || !conversation.commercial_id) {
        console.warn(
          "❌ Impossible d'émettre : chat_id ou commercial_id manquant",
          conversation,
        );
        return;
      }


      // 3️⃣ Temps réel (WebSocket)
      this.messageGateway.emitIncomingMessage(
        conversation.chat_id,
        conversation.commercial_id,
        savedMessage,
      );

      this.messageGateway.emitIncomingConversation(
        conversation
      )



    } catch (error) {
      console.log(error);

      throw new NotFoundException(error);
    }
  }

  async updateStatusMessage(payload: WhapiWebhookPayload): Promise<void> {
    if (!payload?.statuses?.length) return;

    for (const status of payload.statuses) {
      await this.whatsappMessageService.updateByStatus(status);

      this.logger.log(`📌 Status update | msg=${status.id} | ${status.status}`);
    }
  }

  // =========================
  // UTIL
  // =========================
  private extractMessageContent(message: WhapiMessage): string {
    console.log('vfvfhi vijifijij');

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
