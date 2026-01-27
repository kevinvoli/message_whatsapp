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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';

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
    private readonly communicationWhapiService: CommunicationWhapiService,
  ) {}

  async handleIncomingMessage(payload: WhapiWebhookPayload): Promise<void> {
    if (!payload?.messages?.length) return;
    
    const message = payload.messages[0];


    console.log('chaine a evitéttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt',message.from,message.from_name);

     function extractPhoneNumber(chatId: string): string {
      console.log("conversation bani:", toString());
      
        return chatId.split('@')[0];
      }
      const bani= extractPhoneNumber(message.chat_id)

      if (bani.length >= 14) return
    // 🔒 ignorer les messages envoyés par ton propre compte
    if (message.from_me) return;

    const content = this.extractMessageContent(message);
    const messageType = message.type;
    const mediaId =
      message.image?.id ||
      message.video?.id ||
      message.audio?.id ||
      message.document?.id ||
      null;

    const mediaUrl = mediaId ? this.communicationWhapiService.getMediaUrl(mediaId) : undefined;


    try {
      //  1️⃣ Dispatcher (assignation agent ou pending)
      const conversation = await this.dispatcherService.assignConversation(
        message.chat_id,
        message.from_name ?? 'Client',
        content,
        messageType,
        mediaUrl,
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
          mediaUrl,
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
