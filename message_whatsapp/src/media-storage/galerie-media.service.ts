import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { GalleryQueryDto } from './dto/gallery-query.dto';

@Injectable()
export class GalerieMediaService {
  constructor(
    @InjectRepository(WhatsappMedia)
    private readonly mediaRepo: Repository<WhatsappMedia>,
  ) {}

  async findGallery(dto: GalleryQueryDto) {
    const qb = this.mediaRepo
      .createQueryBuilder('media')
      .innerJoin('media.message', 'msg')
      .leftJoin('media.channel', 'channel')
      .leftJoin('msg.poste', 'poste')
      .select([
        'media.id',
        'media.local_url',
        'media.media_type',
        'media.mime_type',
        'media.file_name',
        'media.file_size',
        'media.caption',
        'media.duration_seconds',
        'media.width',
        'media.height',
        'media.downloaded_at',
        'media.createdAt',
        'msg.direction',
        'msg.from',
        'msg.from_name',
        'msg.poste_id',
        'channel.id',
        'channel.label',
        'channel.phone_number',
        'channel.provider',
        'poste.id',
        'poste.name',
        'poste.code',
      ])
      .where('media.local_url IS NOT NULL')
      .andWhere('media.deletedAt IS NULL')
      .andWhere('msg.deletedAt IS NULL');

    if (dto.channelId) {
      qb.andWhere('channel.id = :channelId', { channelId: dto.channelId });
    }
    if (dto.posteId) {
      qb.andWhere('msg.poste_id = :posteId', { posteId: dto.posteId });
    }
    if (dto.direction) {
      qb.andWhere('msg.direction = :direction', { direction: dto.direction });
    }
    if (dto.mediaType) {
      qb.andWhere('media.media_type = :mediaType', { mediaType: dto.mediaType });
    }

    const sortCol = dto.sort === 'fileSize' ? 'media.file_size' : 'media.createdAt';
    qb.orderBy(sortCol, ((dto.order ?? 'desc').toUpperCase()) as 'ASC' | 'DESC');

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 24;
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const sizeQb = this.mediaRepo
      .createQueryBuilder('media')
      .innerJoin('media.message', 'msg')
      .leftJoin('media.channel', 'channel')
      .select('SUM(CAST(media.file_size AS UNSIGNED))', 'totalSize')
      .where('media.local_url IS NOT NULL')
      .andWhere('media.deletedAt IS NULL')
      .andWhere('msg.deletedAt IS NULL');

    if (dto.channelId) sizeQb.andWhere('channel.id = :channelId', { channelId: dto.channelId });
    if (dto.posteId) sizeQb.andWhere('msg.poste_id = :posteId', { posteId: dto.posteId });
    if (dto.direction) sizeQb.andWhere('msg.direction = :direction', { direction: dto.direction });
    if (dto.mediaType) sizeQb.andWhere('media.media_type = :mediaType', { mediaType: dto.mediaType });

    const sizeRow = await sizeQb.getRawOne<{ totalSize: string | null }>();
    const totalSize = sizeRow?.totalSize ? parseInt(sizeRow.totalSize, 10) : 0;

    return { items, total, pages: Math.ceil(total / limit), totalSize };
  }

  async getFilterOptions() {
    const channels = await this.mediaRepo
      .createQueryBuilder('media')
      .innerJoin('media.channel', 'channel')
      .where('media.local_url IS NOT NULL')
      .andWhere('media.deletedAt IS NULL')
      .select([
        'channel.id AS id',
        'channel.label AS label',
        'channel.phone_number AS phone_number',
      ])
      .distinct(true)
      .getRawMany();

    const postes = await this.mediaRepo
      .createQueryBuilder('media')
      .innerJoin('media.message', 'msg')
      .innerJoin('msg.poste', 'poste')
      .where('media.local_url IS NOT NULL')
      .andWhere('media.deletedAt IS NULL')
      .andWhere('msg.deletedAt IS NULL')
      .andWhere('msg.poste_id IS NOT NULL')
      .select([
        'poste.id AS id',
        'poste.name AS name',
        'poste.code AS code',
      ])
      .distinct(true)
      .getRawMany();

    return { channels, postes };
  }
}
