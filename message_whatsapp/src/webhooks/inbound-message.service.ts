import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Mutex } from 'async-mutex';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import {
  ExtractedMedia,
  WhapiRawMedia,
} from 'src/whapi/interface/whapi-webhook.interface';
import {
  WhatsappMedia,
  WhatsappMediaType,
} from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { UnifiedMessage } from './normalization/unified-message';
import { UnifiedStatus } from './normalization/unified-status';
import { ChannelService } from 'src/channel/channel.service';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { AutoMessageOrchestrator } from 'src/message-auto/auto-message-orchestrator.service';
import { SystemAlertService } from 'src/system-alert/system-alert.service';

@Injectable()
export class InboundMessageService {
  private readonly logger = new Logger(InboundMessageService.name);
  private readonly chatMutexes = new Map<string, Mutex>();

  private getChatMutex(chatId: string): Mutex {
    let mutex = this.chatMutexes.get(chatId);
    if (!mutex) {
      mutex = new Mutex();
      this.chatMutexes.set(chatId, mutex);
    }
    return mutex;
  }

  constructor(
    private readonly dispatcherService: DispatcherService,
    private readonly whatsappMessageService: WhatsappMessageService,
    private readonly messageGateway: WhatsappMessageGateway,
    private readonly chatService: WhatsappChatService,
    @InjectRepository(WhatsappMedia)
    private readonly mediaRepository: Repository<WhatsappMedia>,
    private readonly channelService: ChannelService,
    private readonly autoMessageOrchestrator: AutoMessageOrchestrator,
    private readonly systemAlert: SystemAlertService,
  ) {}

  async handleMessages(messages: UnifiedMessage[]): Promise<void> {
    if (!messages.length) return;

    for (const message of messages) {
      const traceId = this.buildMessageTraceId(
        message.providerMessageId,
        message.chatId,
      );
      this.logger.log(
        `INCOMING_RECEIVED trace=${traceId} type=${message.type}`,
      );

      if (message.direction !== 'in') {
        continue;
      }

      const chatValidation = this.validateIncomingChatId(message.chatId);
      if (!chatValidation.valid) {
        this.logger.warn(
          `INCOMING_IGNORED trace=${traceId} reason=${chatValidation.reason} chat_id=${message.chatId ?? 'unknown'}`,
        );
        continue;
      }

      try {
        await this.getChatMutex(message.chatId).runExclusive(async () => {
          const conversation = await this.dispatcherService.assignConversation(
            message.chatId,
            message.fromName ?? 'Client',
            traceId,
            message.tenantId,
            message.channelId,
          );

          if (!conversation) {
            this.logger.warn(
              `INCOMING_NO_AGENT trace=${traceId} chat_id=${message.chatId}`,
            );
            return;
          }

          let savedMessage: Awaited<
            ReturnType<
              typeof this.whatsappMessageService.saveIncomingFromUnified
            >
          >;
          try {
            savedMessage = await this.whatsappMessageService.saveIncomingFromUnified(
              message,
              conversation,
            );
          } catch (saveErr) {
            const msg: string = (saveErr as Error)?.message ?? '';
            // Canal inconnu → le message ne peut pas être sauvegardé.
            // On retourne silencieusement (HTTP 200 à Meta/Whapi) pour stopper
            // les retries infinis du provider.
            if (
              msg.toLowerCase().includes('channel') ||
              msg.toLowerCase().includes('canal') ||
              msg.toLowerCase().includes('non trouve') ||
              msg.toLowerCase().includes('not found')
            ) {
              this.logger.warn(
                `INCOMING_CHANNEL_NOT_FOUND trace=${traceId} channel=${message.channelId} — message ignoré, provider ne réessaiera pas`,
              );
              return;
            }
            throw saveErr;
          }

          if (!savedMessage) {
            throw new NotFoundException('Message non enregistre');
          }
          this.logger.log(
            `INCOMING_PERSISTED trace=${traceId} db_message_id=${savedMessage.id}`,
          );
          this.systemAlert.onInboundMessage();

          const medias = this.extractMediaFromUnified(message);
          // OPT-4 : résoudre le channel une seule fois pour tous les médias
          const mediaChannel: WhapiChannel | null =
            medias.length > 0 && message.channelId
              ? await this.channelService.findByChannelId(message.channelId)
              : null;

          for (const media of medias) {
            await this.saveMedia(media, savedMessage, conversation, {
              tenantId: message.tenantId,
              provider: message.provider,
              providerMediaId: message.media?.id,
              channelId: message.channelId,
              resolvedChannel: mediaChannel,
            });
          }

          const fullMessage =
            await this.whatsappMessageService.findOneWithMedias(savedMessage.id);

          if (!fullMessage) return;

          // Persiste last_client_message_at en DB (pas uniquement en mémoire) pour que
          // executeAutoMessage() puisse recharger la bonne valeur et passer le guard
          // `lastAuto >= lastClient` aux étapes 2, 3, …
          const clientMessageAt = savedMessage.timestamp ?? new Date();

          // Réouverture après réponse agent : repart de zéro sur la séquence auto
          const isReopenedCycle = !!conversation.last_poste_message_at;
          await this.chatService.update(conversation.chat_id, {
            read_only: false,
            last_client_message_at: clientMessageAt,
            waiting_client_reply: false,
            ...(isReopenedCycle
              ? { auto_message_step: 0, last_auto_message_sent_at: null }
              : {}),
          });
          conversation.read_only = false;
          conversation.last_client_message_at = clientMessageAt;
          if (isReopenedCycle) {
            conversation.auto_message_step = 0;
          }

          // Passer fullMessage comme lastMessage : c'est le message entrant = dernier message
          // → évite un SELECT supplémentaire dans notifyNewMessage (OPT-2)
          await this.messageGateway.notifyNewMessage(fullMessage, conversation, fullMessage);
          this.logger.log(
            `INCOMING_DISPATCHED trace=${traceId} poste_id=${conversation.poste_id}`,
          );

          // 🤖 Messages automatiques : déclenché uniquement si l'agent
          // n'a jamais répondu sur ce chat (last_poste_message_at = null).
          // Fire-and-forget : le setTimeout interne est non-bloquant.
          if (!conversation.last_poste_message_at) {
            void this.autoMessageOrchestrator.handleClientMessage(conversation);
          }
        });
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
  }

  async handleStatuses(statuses: UnifiedStatus[]): Promise<void> {
    for (const status of statuses) {
      await this.whatsappMessageService.updateStatusFromUnified(status);
      this.logger.log(
        `STATUS_UPDATE provider_message_id=${status.providerMessageId} status=${status.status}`,
      );

      // P1: Broadcast au frontend via WebSocket
      await this.messageGateway.notifyStatusUpdate({
        providerMessageId: status.providerMessageId,
        status: status.status,
        errorCode: status.errorCode,
        errorTitle: status.errorTitle,
      });
    }
  }

  private async saveMedia(
    media: ExtractedMedia,
    messageEntity,
    chatEntity,
    context?: {
      tenantId?: string;
      provider?: string;
      providerMediaId?: string;
      channelId?: string;
      resolvedChannel?: WhapiChannel | null;
    },
  ) {
    const entity = new WhatsappMedia();

    entity.media_type = media.type as WhatsappMediaType;
    entity.tenant_id = context?.tenantId ?? null;
    entity.provider = context?.provider ?? null;
    entity.provider_media_id = context?.providerMediaId ?? null;
    entity.media_id = media.media_id!;
    entity.whapi_media_id = media.media_id!;
    entity.mime_type = media.mime_type ?? '';
    entity.file_name = media.file_name ?? null;
    entity.file_size = media.file_size?.toString() ?? null;
    entity.duration_seconds = media.seconds ?? null;
    entity.caption = media.caption ?? null;

    const raw = media.payload as WhapiRawMedia | undefined;
    entity.sha256 = raw?.sha256 ?? null;

    // Attach channel — utiliser le channel pré-résolu (OPT-4) sinon charger depuis la DB
    if (context?.resolvedChannel) {
      entity.channel = context.resolvedChannel;
    } else if (context?.channelId) {
      const ch = await this.channelService.findByChannelId(context.channelId);
      if (ch) {
        entity.channel = ch;
      }
    }

    // Resolve media URL
    let mediaUrl = raw?.link ?? null;

    // Meta provider: no local storage. Use proxy endpoint for streaming.
    // Chemin relatif : le frontend préfixe avec NEXT_PUBLIC_API_URL
    if (!mediaUrl && context?.provider === 'meta' && context?.providerMediaId) {
      const channelQuery = context.channelId
        ? `?channelId=${encodeURIComponent(context.channelId)}`
        : '';
      mediaUrl = `/messages/media/meta/${context.providerMediaId}${channelQuery}`;
    }

    // Messenger: les URLs CDN expirent → toujours utiliser le proxy qui re-fetch via Graph API
    if (context?.provider === 'messenger' && context?.providerMediaId) {
      const channelQuery = context.channelId
        ? `?channelId=${encodeURIComponent(context.channelId)}`
        : '';
      mediaUrl = `/messages/media/messenger/${context.providerMediaId}${channelQuery}`;
    }

    entity.url = mediaUrl;

    entity.chat = chatEntity;
    entity.message = messageEntity;
    entity.preview = null;
    entity.view_once = '0';

    await this.mediaRepository.save(entity);
  }

  private extractMediaFromUnified(message: UnifiedMessage): ExtractedMedia[] {
    if (!message.media && !message.location) {
      return [];
    }

    const mediaType =
      message.type === 'interactive' || message.type === 'button'
        ? 'interactive'
        : message.type;
    const normalizedType = (
      [
        'image',
        'video',
        'audio',
        'voice',
        'document',
        'gif',
        'short',
        'location',
        'live_location',
      ].includes(mediaType)
        ? mediaType
        : 'text'
    ) as ExtractedMedia['type'];

    if (message.location) {
      return [
        {
          type: 'location',
          latitude: message.location.latitude,
          longitude: message.location.longitude,
        },
      ];
    }

    if (message.media) {
      return [
        {
          type: normalizedType,
          media_id: message.media.id,
          mime_type: message.media.mimeType,
          caption: message.media.caption,
          file_name: message.media.fileName,
          file_size: message.media.fileSize,
          seconds: message.media.seconds,
          payload: { link: message.media.link } as WhapiRawMedia,
        },
      ];
    }

    return [];
  }

  private validateIncomingChatId(chatId: string | null | undefined): {
    valid: boolean;
    reason?: string;
  } {
    if (!chatId || typeof chatId !== 'string') {
      return { valid: false, reason: 'missing_chat_id' };
    }

    const trimmedChatId = chatId.trim();
    if (!trimmedChatId.includes('@')) {
      return { valid: false, reason: 'invalid_chat_id_format' };
    }

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

  private buildMessageTraceId(
    messageId?: string | null,
    chatId?: string,
  ): string {
    return messageId ?? `chat:${chatId ?? 'unknown'}:${Date.now()}`;
  }

}
