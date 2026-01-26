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
import { ChannelService } from 'src/channel/channel.service';

@Injectable()
export class WhapiService {
  private readonly logger = new Logger(WhapiService.name);

  constructor(
    private readonly dispatcherService: DispatcherService,
    private readonly whatsappMessageService: WhatsappMessageService,
    private readonly channelService: ChannelService,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
  ) {}

  async handleIncomingMessage(payload: WhapiWebhookPayload): Promise<void> {
    if (!payload?.messages?.length) return;

    const message = payload.messages[0];
    message.channel_id = payload.channel_id

  
    const existingMessage= await this.whatsappMessageService.findOne(message.id)
    // console.log("============il existe deja================");
    if (existingMessage) {
      return  ;
    }
    

    function extractPhoneNumber(chatId: string): string {
      // console.log('conversation bani:', toString());

      return chatId.split('@')[0];
    }
    const bani = extractPhoneNumber(message.chat_id);

    if (bani.length >= 14) return;

    // Si le message vient de nous, on le sauvegarde et on notifie le front.
    if (message.from_me) {
      const chat = await this.chatRepository.findOne({ where: { chat_id: message.chat_id, channel_id: message.channel_id } });
      if (chat) {
        await this.whatsappMessageService.saveFromWhapi(message, chat);
        this.messageGateway.emitConversationUpdate(chat.chat_id, chat.channel_id);
      }
      return;
    }

    // Si le message vient du client, on suit le processus de dispatching.
    const content = this.extractMessageContent(message);
    const messageType = message.type;
    const mediaUrl =
      message.image?.id ||
      message.video?.id ||
      message.audio?.id ||
      message.document?.id ||
      null;

    try {
      // 0️⃣ Vérifier si le canal existe
      const channel = await this.channelService.findByChannelId(message.channel_id);
      if (!channel) {
        this.logger.error(`Message reçu d'un canal inconnu: ${message.channel_id}. Message ignoré.`);
        return; // Arrêter le traitement ici
      }

      //  1️⃣ Dispatcher (assignation agent ou pending)
      const conversation = await this.dispatcherService.assignConversation(
        message.chat_id,
        message.channel_id,
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
        await this.whatsappMessageService.saveFromWhapi(
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
      // this.messageGateway.emitIncomingMessage(
      //   conversation.chat_id,
      //   conversation.commercial_id,
      //   savedMessage,
      // );

      this.messageGateway.emitIncomingConversation(conversation);
    } catch (error) {
      this.logger.error(`Erreur inattendue lors du traitement du message entrant: ${error.message}`, error.stack);
      // Ne pas relancer l'exception pour éviter de faire crasher le serveur
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
