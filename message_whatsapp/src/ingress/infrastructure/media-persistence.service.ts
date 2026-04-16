import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WhatsappMedia,
  WhatsappMediaType,
} from 'src/whatsapp_media/entities/whatsapp_media.entity';
import {
  ExtractedMedia,
  WhapiRawMedia,
} from 'src/whapi/interface/whapi-webhook.interface';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ChannelService } from 'src/channel/channel.service';
import { UnifiedMessage } from 'src/webhooks/normalization/unified-message';

export interface MediaPersistContext {
  tenantId?: string;
  provider?: string;
  providerMediaId?: string;
  channelId?: string;
  /** Channel pré-résolu — évite un SELECT supplémentaire si déjà disponible (OPT-4) */
  resolvedChannel?: WhapiChannel | null;
}

/**
 * TICKET-04-B — Persistance des médias extraits d'un message entrant.
 *
 * Construit l'entité `WhatsappMedia` à partir d'un `ExtractedMedia`,
 * résout l'URL (Whapi = lien direct, Meta/Messenger = proxy).
 * Sauvegarde en DB.
 */
@Injectable()
export class MediaPersistenceService {
  private readonly logger = new Logger(MediaPersistenceService.name);

  constructor(
    @InjectRepository(WhatsappMedia)
    private readonly mediaRepository: Repository<WhatsappMedia>,
    private readonly channelService: ChannelService,
  ) {}

  /**
   * Persiste un seul média.
   * @param media      Média extrait par `MediaExtractionService`
   * @param message    Entité message (relation)
   * @param chat       Entité conversation (relation)
   * @param context    Contexte provider (pour l'URL proxy et le channel)
   */
  async persist(
    media: ExtractedMedia,
    message: { id: string },
    chat: { id?: string },
    context: MediaPersistContext = {},
  ): Promise<WhatsappMedia> {
    const entity = new WhatsappMedia();

    entity.media_type = media.type as WhatsappMediaType;
    entity.tenant_id = context.tenantId ?? null;
    entity.provider = context.provider ?? null;
    entity.provider_media_id = context.providerMediaId ?? null;
    entity.media_id = media.media_id!;
    entity.whapi_media_id = media.media_id!;
    entity.mime_type = media.mime_type ?? '';
    entity.file_name = media.file_name ?? null;
    entity.file_size = media.file_size?.toString() ?? null;
    entity.duration_seconds = media.seconds ?? null;
    entity.caption = media.caption ?? null;

    const raw = media.payload as WhapiRawMedia | undefined;
    entity.sha256 = raw?.sha256 ?? null;

    // Résolution du channel
    if (context.resolvedChannel) {
      entity.channel = context.resolvedChannel;
    } else if (context.channelId) {
      const ch = await this.channelService.findByChannelId(context.channelId);
      if (ch) entity.channel = ch;
    }

    // Résolution de l'URL selon le provider
    let mediaUrl = raw?.link ?? null;

    if (!mediaUrl && context.provider === 'meta' && context.providerMediaId) {
      const channelQuery = context.channelId
        ? `?channelId=${encodeURIComponent(context.channelId)}`
        : '';
      mediaUrl = `/messages/media/meta/${context.providerMediaId}${channelQuery}`;
    }

    if (context.provider === 'messenger' && context.providerMediaId) {
      const channelQuery = context.channelId
        ? `?channelId=${encodeURIComponent(context.channelId)}`
        : '';
      mediaUrl = `/messages/media/messenger/${context.providerMediaId}${channelQuery}`;
    }

    entity.url = mediaUrl;
    entity.chat = chat as any;
    entity.message = message as any;
    entity.preview = null;
    entity.view_once = '0';

    return this.mediaRepository.save(entity);
  }

  /**
   * Persiste tous les médias extraits d'un message.
   * Pré-résout le channel une seule fois pour tous les médias (OPT-4).
   */
  async persistAll(
    medias: ExtractedMedia[],
    message: { id: string },
    chat: { id?: string },
    unifiedMessage: Pick<UnifiedMessage, 'tenantId' | 'provider' | 'channelId' | 'media'>,
  ): Promise<void> {
    if (medias.length === 0) return;

    // P2.4.1 — Résolution channel unique + batch insert (au lieu de N inserts séquentiels)
    const resolvedChannel: WhapiChannel | null =
      unifiedMessage.channelId
        ? await this.channelService.findByChannelId(unifiedMessage.channelId)
        : null;

    const context = {
      tenantId: unifiedMessage.tenantId,
      provider: unifiedMessage.provider,
      providerMediaId: unifiedMessage.media?.id,
      channelId: unifiedMessage.channelId,
      resolvedChannel,
    };

    // Construire toutes les entités en mémoire
    const entities = await Promise.all(
      medias.map((media) => this.buildEntity(media, message, chat, context)),
    );

    // Un seul INSERT pour tous les médias du message
    await this.mediaRepository.save(entities);
  }

  /**
   * Construit l'entité WhatsappMedia sans la persister.
   * Utilisé par persistAll() pour le batch insert.
   */
  private async buildEntity(
    media: ExtractedMedia,
    message: { id: string },
    chat: { id?: string },
    context: MediaPersistContext = {},
  ): Promise<WhatsappMedia> {
    const entity = new WhatsappMedia();

    entity.media_type = media.type as WhatsappMediaType;
    entity.tenant_id = context.tenantId ?? null;
    entity.provider = context.provider ?? null;
    entity.provider_media_id = context.providerMediaId ?? null;
    entity.media_id = media.media_id!;
    entity.whapi_media_id = media.media_id!;
    entity.mime_type = media.mime_type ?? '';
    entity.file_name = media.file_name ?? null;
    entity.file_size = media.file_size?.toString() ?? null;
    entity.duration_seconds = media.seconds ?? null;
    entity.caption = media.caption ?? null;

    const raw = media.payload as WhapiRawMedia | undefined;
    entity.sha256 = raw?.sha256 ?? null;

    if (context.resolvedChannel) {
      entity.channel = context.resolvedChannel;
    } else if (context.channelId) {
      const ch = await this.channelService.findByChannelId(context.channelId);
      if (ch) entity.channel = ch;
    }

    let mediaUrl = raw?.link ?? null;

    if (!mediaUrl && context.provider === 'meta' && context.providerMediaId) {
      const channelQuery = context.channelId
        ? `?channelId=${encodeURIComponent(context.channelId)}`
        : '';
      mediaUrl = `/messages/media/meta/${context.providerMediaId}${channelQuery}`;
    }

    if (context.provider === 'messenger' && context.providerMediaId) {
      const channelQuery = context.channelId
        ? `?channelId=${encodeURIComponent(context.channelId)}`
        : '';
      mediaUrl = `/messages/media/messenger/${context.providerMediaId}${channelQuery}`;
    }

    entity.url = mediaUrl;
    entity.chat = chat as any;
    entity.message = message as any;
    entity.preview = null;
    entity.view_once = '0';

    return entity;
  }
}
