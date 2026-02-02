import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import {
  ExtractedMedia,
  WhapiMessage,
  WhapiRawMedia,
  WhapiWebhookPayload,
} from './interface/whapi-webhook.interface';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import {
  WhatsappMedia,
  WhatsappMediaType,
} from 'src/whatsapp_media/entities/whatsapp_media.entity';

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

    @InjectRepository(WhatsappMedia)
    private readonly mediaRepository: Repository<WhatsappMedia>,
  ) {}

  // ======================================================
  // INCOMING MESSAGE
  // ======================================================
  async handleIncomingMessage(payload: WhapiWebhookPayload): Promise<void> {
    if (!payload?.messages?.length) return;

    const message = payload.messages[0];
    message.channel_id = payload.channel_id;

    // 🔒 ignore self messages
    if (message.from_me) return;

    const chatPhone = message.chat_id.split('@')[0];
    if (chatPhone.length >= 14) return;

    try {
      // 1️⃣ Dispatcher → attribution conversation
      const conversation = await this.dispatcherService.assignConversation(
        message.chat_id,
        message.from_name ?? 'Client',
        this.extractMessageContent(message),
        message.type,
        '',
      );

      if (!conversation) {
        this.logger.warn(
          `⏳ Aucun agent disponible (${message.chat_id})`,
        );
        return;
      }

      // 2️⃣ Sauvegarde message
      const savedMessage =
        await this.whatsappMessageService.saveIncomingFromWhapi(
          message,
          conversation,
        );

      if (!savedMessage) {
        throw new NotFoundException('Message non enregistré');
      }

      // 3️⃣ Sauvegarde médias
      const medias = this.extractMedia(message);
      for (const media of medias) {
        await this.saveMedia(media, savedMessage, conversation);
      }

      console.log("dans ========",medias);

      const fullMessage =
  await this.whatsappMessageService.findOneWithMedias(savedMessage.id);

  if (!fullMessage) return;
      
      // 4️⃣ NOTIFIER LE GATEWAY (POINT UNIQUE)
      await this.messageGateway.notifyNewMessage(
    fullMessage, conversation);
    } catch (error) {
      this.logger.error(error);
    }
  }

  // ======================================================
  // MEDIA
  // ======================================================
  private async saveMedia(
    media: ExtractedMedia,
    messageEntity,
    chatEntity,
  ) {
    const entity = new WhatsappMedia();

    entity.media_type = media.type as WhatsappMediaType;
    entity.media_id = media.media_id!;
    entity.whapi_media_id = media.media_id!;
    entity.mime_type = media.mime_type ?? '';
    entity.file_name = media.file_name ?? null;
    entity.file_size = media.file_size?.toString() ?? null;
    entity.duration_seconds = media.seconds ?? null;
    entity.caption = media.caption ?? null;

    const raw = media.payload as WhapiRawMedia | undefined;
    entity.sha256 = raw?.sha256 ?? null;
    entity.url = raw?.link ?? null;

    entity.chat = chatEntity;
    entity.message = messageEntity;
    entity.preview = null;
    entity.view_once = '0';

    await this.mediaRepository.save(entity);
  }

  // ======================================================
  // EXTRACTION MEDIA
  // ======================================================
  private extractMedia(message: WhapiMessage): ExtractedMedia[] {
    const medias: ExtractedMedia[] = [];

    if (message.image)
      medias.push({ type: 'image', media_id: message.image.id, mime_type: message.image.mime_type, caption: message.image.caption, payload: message.image });

    if (message.video)
      medias.push({ type: 'video', media_id: message.video.id, mime_type: message.video.mime_type, caption: message.video.caption, seconds: message.video.seconds, payload: message.video });

    if (message.audio)
      medias.push({ type: 'audio', media_id: message.audio.id, mime_type: message.audio.mime_type, seconds: message.audio.seconds, payload: message.audio });

    if (message.voice)
      medias.push({ type: 'voice', media_id: message.voice.id, mime_type: message.voice.mime_type ?? 'audio/ogg', seconds: message.voice.seconds, payload: message.voice });

    if (message.document)
      medias.push({ type: 'document', media_id: message.document.id, mime_type: message.document.mime_type, file_name: message.document.filename, file_size: message.document.file_size, payload: message.document });

    if (message.location)
      medias.push({ type: 'location', latitude: message.location.latitude, longitude: message.location.longitude });

    return medias;
  }

  // ======================================================
  // TEXT FALLBACK
  // ======================================================
  private extractMessageContent(message: WhapiMessage): string {
    switch (message.type) {
      case 'text': return message.text?.body ?? '';
      case 'image': return message.image?.caption ?? '[Image]';
      case 'video': return message.video?.caption ?? '[Vidéo]';
      case 'audio':
      case 'voice': return '[Audio]';
      case 'document': return message.document?.filename ?? '[Document]';
      default: return '[Message]';
    }
  }

  // ======================================================
  // STATUS UPDATE
  // ======================================================
  async updateStatusMessage(payload: WhapiWebhookPayload): Promise<void> {
    if (!payload?.statuses?.length) return;

    for (const status of payload.statuses) {
      await this.whatsappMessageService.updateByStatus(status);
      this.logger.log(`📌 Status | ${status.id} → ${status.status}`);
    }
  }
}
