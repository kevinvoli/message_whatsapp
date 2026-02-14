import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  NotFoundException,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { createHash } from 'crypto';
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
import { QueryFailedError, Repository } from 'typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { AutoMessageOrchestrator } from '../message-auto/auto-message-orchestrator.service';
import {
  WhatsappMedia,
  WhatsappMediaType,
} from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { WebhookEventLog } from './entities/webhook-event.entity';
import { ChannelService } from 'src/channel/channel.service';
import { WebhookMetricsService } from './webhook-metrics.service';

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

    @InjectRepository(WebhookEventLog)
    private readonly webhookEventRepository: Repository<WebhookEventLog>,

    private readonly channelService: ChannelService,
    private readonly metricsService: WebhookMetricsService,
    private readonly autoMessageOrchestratorServcie: AutoMessageOrchestrator,
  ) {}

  async findChannelByExternalId(channelId: string) {
    return this.channelService.findByChannelId(channelId);
  }

  async ensureTenantId(channel: { id: string; tenant_id?: string | null }) {
    return this.channelService.ensureTenantId(channel as any);
  }

  async upsertProviderMapping(params: {
    tenant_id: string;
    provider: string;
    external_id: string;
    channel_id?: string | null;
  }) {
    await this.channelService.upsertProviderMapping(params);
  }

  async resolveTenantByProviderExternalId(
    provider: string,
    externalId: string,
  ): Promise<string | null> {
    return this.channelService.resolveTenantByProviderExternalId(
      provider,
      externalId,
    );
  }

  async isReplayEvent(
    payload: WhapiWebhookPayload,
    provider: 'whapi' | 'meta',
  ): Promise<boolean> {
    const keys = this.buildIdempotencyKeys(payload, provider);
    if (!keys.length) {
      return false;
    }

    let insertedCount = 0;
    for (const key of keys) {
      const inserted = await this.tryRegisterEventKey(
        key,
        provider,
        payload?.event?.type ?? null,
      );
      if (inserted) {
        insertedCount += 1;
      }
    }

    return insertedCount === 0;
  }

  // ======================================================
  // INCOMING MESSAGE
  // ======================================================
  async handleIncomingMessage(payload: WhapiWebhookPayload): Promise<void> {
    if (!payload?.messages?.length) return;

    const message = payload.messages[0];
    message.channel_id = payload.channel_id;
    const traceId = this.buildMessageTraceId(message.id, message.chat_id);
    this.logger.log(`INCOMING_RECEIVED trace=${traceId} type=${message.type}`);

    // ðŸ”’ ignore self messages
    if (message.from_me) return;

    const chatValidation = this.validateIncomingChatId(message.chat_id);
    if (!chatValidation.valid) {
      this.logger.warn(
        `INCOMING_IGNORED trace=${traceId} reason=${chatValidation.reason} chat_id=${message.chat_id ?? 'unknown'}`,
      );
      return;
    }

    try {
      // 1ï¸âƒ£ Dispatcher â†’ attribution conversation
      const conversation = await this.dispatcherService.assignConversation(
        message.chat_id,
        message.from_name ?? 'Client',
        traceId,
      );

      if (!conversation) {
        this.logger.warn(
          `INCOMING_NO_AGENT trace=${traceId} chat_id=${message.chat_id}`,
        );
        return;
      }

      // 2ï¸âƒ£ Sauvegarde message
      const savedMessage =
        await this.whatsappMessageService.saveIncomingFromWhapi(
          message,
          conversation,
        );

      if (!savedMessage) {
        throw new NotFoundException('Message non enregistrÃ©');
      }
      this.logger.log(
        `INCOMING_PERSISTED trace=${traceId} db_message_id=${savedMessage.id}`,
      );

      // await this.autoMessageOrchestratorServcie.handleClientMessage(
      //   conversation,
      // );
      // 3ï¸âƒ£ Sauvegarde mÃ©dias
      const medias = this.extractMedia(message);
      for (const media of medias) {
        await this.saveMedia(media, savedMessage, conversation);
      }

      const fullMessage = await this.whatsappMessageService.findOneWithMedias(
        savedMessage.id,
      );

      if (!fullMessage) return;
    // console.log("la conversation",conversation);


      // 4ï¸âƒ£ NOTIFIER LE GATEWAY (POINT UNIQUE)
      await this.messageGateway.notifyNewMessage(fullMessage, conversation);
      this.logger.log(
        `INCOMING_DISPATCHED trace=${traceId} poste_id=${conversation.poste_id}`,
      );
    } catch (err) {
      throw new HttpException(
        {
          status: 'error',
          message: err.message || 'Webhook processing failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ======================================================
  // MEDIA
  // ======================================================
  private async saveMedia(media: ExtractedMedia, messageEntity, chatEntity) {
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
      medias.push({
        type: 'image',
        media_id: message.image.id,
        mime_type: message.image.mime_type,
        caption: message.image.caption,
        payload: message.image,
      });

    if (message.video)
      medias.push({
        type: 'video',
        media_id: message.video.id,
        mime_type: message.video.mime_type,
        caption: message.video.caption,
        seconds: message.video.seconds,
        payload: message.video,
      });

    if (message.audio)
      medias.push({
        type: 'audio',
        media_id: message.audio.id,
        mime_type: message.audio.mime_type,
        seconds: message.audio.seconds,
        payload: message.audio,
      });

    if (message.voice)
      medias.push({
        type: 'voice',
        media_id: message.voice.id,
        mime_type: message.voice.mime_type ?? 'audio/ogg',
        seconds: message.voice.seconds,
        payload: message.voice,
      });

    if (message.document)
      medias.push({
        type: 'document',
        media_id: message.document.id,
        mime_type: message.document.mime_type,
        file_name: message.document.filename,
        file_size: message.document.file_size,
        payload: message.document,
      });

    if (message.location)
      medias.push({
        type: 'location',
        latitude: message.location.latitude,
        longitude: message.location.longitude,
      });

    return medias;
  }



  // ======================================================
  // TEXT FALLBACK
  // ======================================================
  // ======================================================
  // STATUS UPDATE
  // ======================================================
  async updateStatusMessage(payload: WhapiWebhookPayload): Promise<void> {
    if (!payload?.statuses?.length) return;

    for (const status of payload.statuses) {
      await this.whatsappMessageService.updateByStatus(status);
      this.logger.log(`ðŸ“Œ Status | ${status.id} â†’ ${status.status}`);
    }
  }

  private validateIncomingChatId(
    chatId: string | null | undefined,
  ): { valid: boolean; reason?: string } {
    if (!chatId || typeof chatId !== 'string') {
      return { valid: false, reason: 'missing_chat_id' };
    }

    const trimmedChatId = chatId.trim();
    if (!trimmedChatId.includes('@')) {
      return { valid: false, reason: 'invalid_chat_id_format' };
    }

    // g.us = group chat, currently unsupported in assignment flow.
    if (trimmedChatId.endsWith('@g.us')) {
      return { valid: false, reason: 'group_chat_not_supported' };
    }

    const phoneCandidate = trimmedChatId.split('@')[0] ?? '';
    const normalizedPhone = phoneCandidate.replace(/[^\d]/g, '');
    if (!normalizedPhone) {
      return { valid: false, reason: 'missing_phone_in_chat_id' };
    }

    if (normalizedPhone.length < 8 || normalizedPhone.length > 20) {
      return { valid: false, reason: 'phone_length_out_of_range' };
    }

    return { valid: true };
  }

  private buildIdempotencyKeys(
    payload: WhapiWebhookPayload,
    provider: string,
  ): string[] {
    const base = `${provider}:${payload?.channel_id ?? 'unknown'}:${
      payload?.event?.type ?? 'unknown'
    }`;

    const messageIds =
      payload?.messages
        ?.map((message) => message?.id)
        .filter((id): id is string => Boolean(id))
        .map((id) => `${base}:message:${id}`) ?? [];

    const statusIds =
      payload?.statuses
        ?.map((status) =>
          status?.id
            ? `${base}:status:${status.id}:${status.status ?? 'unknown'}`
            : null,
        )
        .filter((value): value is string => Boolean(value)) ?? [];

    const keys = [...messageIds, ...statusIds];
    if (keys.length > 0) {
      return keys;
    }

    return [`${base}:hash:${this.hashPayload(payload)}`];
  }

  private async tryRegisterEventKey(
    eventKey: string,
    provider: string,
    eventType: string | null,
  ): Promise<boolean> {
    try {
      await this.webhookEventRepository.save(
        this.webhookEventRepository.create({
          event_key: eventKey,
          provider,
          event_type: eventType ?? undefined,
        }),
      );
      return true;
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        typeof (error as any).driverError?.code === 'string' &&
        ['ER_DUP_ENTRY', '23505', 'SQLITE_CONSTRAINT'].includes(
          (error as any).driverError.code,
        )
      ) {
        this.metricsService.recordIdempotencyConflict(provider);
        return false;
      }
      if (
        error instanceof QueryFailedError &&
        (error as any).driverError?.code === 'ER_NO_SUCH_TABLE'
      ) {
        this.logger.warn(
          'Webhook idempotency table missing, continuing without dedupe',
        );
        return true;
      }
      throw error;
    }
  }

  private buildMessageTraceId(
    messageId?: string | null,
    chatId?: string,
  ): string {
    return messageId ?? `chat:${chatId ?? 'unknown'}:${Date.now()}`;
  }

  private hashPayload(payload: WhapiWebhookPayload): string {
    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}
