import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { MediaStorageService } from './media-storage.service';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { CommunicationMessengerService } from 'src/communication_whapi/communication_messenger.service';
import { ChannelService } from 'src/channel/channel.service';

@Injectable()
export class MediaDownloadService {
  private readonly logger = new Logger(MediaDownloadService.name);

  constructor(
    @InjectRepository(WhatsappMedia)
    private readonly mediaRepository: Repository<WhatsappMedia>,
    private readonly metaService: CommunicationMetaService,
    private readonly whapiService: CommunicationWhapiService,
    private readonly messengerService: CommunicationMessengerService,
    private readonly channelService: ChannelService,
    private readonly mediaStorageService: MediaStorageService,
  ) {}

  /**
   * Télécharge localement un média reçu via webhook et met à jour l'entité en base.
   * Méthode idempotente : sans effet si le fichier est déjà présent ou si l'URL a expiré.
   */
  async downloadForMedia(media: WhatsappMedia): Promise<void> {
    try {
      // Idempotence — déjà téléchargé
      if (media.local_path) {
        return;
      }

      // URL provider définitivement expirée — inutile de retenter
      if (media.provider_url_expired) {
        return;
      }

      // Charger le channel depuis la DB avec la relation si non résolu dans l'entité
      let channel = media.channel ?? null;
      if (!channel) {
        const withChannel = await this.mediaRepository.findOne({
          where: { id: media.id },
          relations: ['channel'],
        });
        channel = withChannel?.channel ?? null;
      }

      if (!channel || !channel.token) {
        this.logger.warn(
          `MEDIA_DOWNLOAD_SKIP mediaId=${media.id} — channel introuvable ou sans token (problème de configuration, non marqué expiré)`,
        );
        return;
      }

      let downloaded: { buffer: Buffer; mimeType: string } | null = null;

      switch (media.provider) {
        case 'meta':
          if (!media.provider_media_id) {
            this.logger.warn(
              `MEDIA_DOWNLOAD_SKIP mediaId=${media.id} provider=meta — provider_media_id manquant`,
            );
            return;
          }
          downloaded = await this.metaService.downloadMedia(
            media.provider_media_id,
            channel.token,
            channel.channel_id ?? undefined,
          );
          break;

        case 'whapi':
          if (!media.whapi_media_id) {
            this.logger.warn(
              `MEDIA_DOWNLOAD_SKIP mediaId=${media.id} provider=whapi — whapi_media_id manquant`,
            );
            return;
          }
          downloaded = await this.whapiService.downloadMedia(
            media.whapi_media_id,
            channel.channel_id,
          );
          break;

        case 'messenger':
          if (!media.provider_media_id) {
            this.logger.warn(
              `MEDIA_DOWNLOAD_SKIP mediaId=${media.id} provider=messenger — provider_media_id manquant`,
            );
            return;
          }
          downloaded = await this.messengerService.downloadMedia(
            media.provider_media_id,
            channel.token,
            channel.external_id ?? undefined,
          );
          break;

        default:
          this.logger.warn(
            `MEDIA_DOWNLOAD_SKIP mediaId=${media.id} — provider inconnu : ${media.provider ?? 'null'}`,
          );
          return;
      }

      if (!downloaded) {
        // Le provider a retourné null → URL expirée ou média définitivement indisponible
        await this.mediaRepository.update(media.id, { provider_url_expired: true });
        this.logger.warn(
          `MEDIA_DOWNLOAD_EXPIRED mediaId=${media.id} provider=${media.provider} — marqué expiré`,
        );
        return;
      }

      const stored = await this.mediaStorageService.store(
        downloaded.buffer,
        downloaded.mimeType,
        media.id,
        media.tenant_id,
      );

      await this.mediaRepository.update(media.id, {
        local_url: stored.localUrl,
        local_path: stored.localPath,
        downloaded_at: new Date(),
      });

      this.logger.log(
        `MEDIA_DOWNLOAD_OK mediaId=${media.id} provider=${media.provider} path=${stored.localPath}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `MEDIA_DOWNLOAD_ERROR mediaId=${media.id} — erreur inattendue : ${message}`,
      );
      // Ne pas propager — appelé via setImmediate
    }
  }
}
