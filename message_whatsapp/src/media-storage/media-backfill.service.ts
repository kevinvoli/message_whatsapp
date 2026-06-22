import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { MediaDownloadService } from './media-download.service';
import { MediaStorageService } from './media-storage.service';

@Injectable()
export class MediaBackfillService {
  private readonly logger = new Logger(MediaBackfillService.name);

  constructor(
    @InjectRepository(WhatsappMedia)
    private readonly mediaRepository: Repository<WhatsappMedia>,
    private readonly mediaDownloadService: MediaDownloadService,
    private readonly mediaStorageService: MediaStorageService,
  ) {}

  /**
   * Rattrapage des médias non téléchargés lors de la réception webhook.
   * Traite jusqu'à 200 médias des 30 derniers jours en batches de 5 en parallèle,
   * avec une pause de 500 ms entre chaque batch pour respecter les rate limits des providers.
   */
  @Cron('0 3 * * *')
  async backfillMediaDownloads(): Promise<void> {
    this.logger.log('MEDIA_BACKFILL_START — début du rattrapage des médias non téléchargés');

    const medias = await this.mediaRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.channel', 'channel')
      .where('m.local_path IS NULL')
      .andWhere('m.provider_url_expired = :expired', { expired: false })
      .andWhere('m.createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)')
      .andWhere('m.provider IN (:...providers)', {
        providers: ['meta', 'whapi', 'messenger'],
      })
      .limit(200)
      .getMany();

    this.logger.log(
      `MEDIA_BACKFILL_FOUND count=${medias.length} médias à traiter`,
    );

    const BATCH_SIZE = 5;
    let successCount = 0;

    for (let i = 0; i < medias.length; i += BATCH_SIZE) {
      const batch = medias.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((media) =>
          this.mediaDownloadService
            .downloadForMedia(media)
            .then(() => true)
            .catch((err: unknown) => {
              this.logger.warn(
                `Backfill failed for media ${media.id}: ${err instanceof Error ? err.message : String(err)}`,
                MediaBackfillService.name,
              );
              return false;
            }),
        ),
      );
      successCount += results.filter(Boolean).length;

      // Pause entre les groupes pour respecter les rate limits des providers
      if (i + BATCH_SIZE < medias.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    this.logger.log(
      `MEDIA_BACKFILL_DONE traités=${successCount}/${medias.length}`,
    );
  }

  /**
   * Marque comme expirés les médias non téléchargés datant de plus de 30 jours.
   * Les URLs provider ont très certainement expiré au-delà de ce délai.
   */
  @Cron('0 4 * * *')
  async markExpiredMediaUrls(): Promise<void> {
    this.logger.log('MEDIA_EXPIRE_START — marquage des médias expirés');

    const result = await this.mediaRepository
      .createQueryBuilder()
      .update(WhatsappMedia)
      .set({ provider_url_expired: true })
      .where('local_path IS NULL')
      .andWhere('provider_url_expired = :expired', { expired: false })
      .andWhere('createdAt < DATE_SUB(NOW(), INTERVAL 30 DAY)')
      .execute();

    this.logger.log(
      `MEDIA_EXPIRE_DONE affectés=${result.affected ?? 0}`,
    );
  }

  /**
   * Nettoyage des fichiers locaux de plus de 6 mois pour libérer l'espace disque.
   * Supprime le fichier physique puis efface local_path/local_url en DB.
   * Les médias récents (< 6 mois) ne sont jamais touchés.
   */
  @Cron('0 5 1 * *')
  async purgeOldLocalFiles(): Promise<void> {
    this.logger.log('MEDIA_PURGE_START — nettoyage des fichiers locaux > 6 mois');

    const medias = await this.mediaRepository
      .createQueryBuilder('m')
      .select(['m.id', 'm.local_path'])
      .where('m.local_path IS NOT NULL')
      .andWhere('m.downloaded_at < DATE_SUB(NOW(), INTERVAL 6 MONTH)')
      .getMany();

    this.logger.log(`MEDIA_PURGE_FOUND count=${medias.length} fichiers à supprimer`);

    let deleted = 0;
    for (const media of medias) {
      this.mediaStorageService.deleteFile(media.local_path!);
      await this.mediaRepository.update(media.id, {
        local_path: null,
        local_url: null,
        downloaded_at: null,
      });
      deleted++;
    }

    this.logger.log(`MEDIA_PURGE_DONE supprimés=${deleted}/${medias.length}`);
  }
}
