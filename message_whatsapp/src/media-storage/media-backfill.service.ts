import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { MediaDownloadService } from './media-download.service';

@Injectable()
export class MediaBackfillService {
  private readonly logger = new Logger(MediaBackfillService.name);

  constructor(
    @InjectRepository(WhatsappMedia)
    private readonly mediaRepository: Repository<WhatsappMedia>,
    private readonly mediaDownloadService: MediaDownloadService,
  ) {}

  /**
   * Rattrapage des médias non téléchargés lors de la réception webhook.
   * Traite jusqu'à 200 médias des 30 derniers jours, avec une pause de 500 ms entre chaque
   * appel aux APIs providers pour éviter le throttling.
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

    let successCount = 0;
    for (const media of medias) {
      await this.mediaDownloadService.downloadForMedia(media);
      successCount++;

      // Pause entre chaque appel pour ne pas saturer les APIs providers
      await new Promise((resolve) => setTimeout(resolve, 500));
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
}
