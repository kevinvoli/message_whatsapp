import * as fs from 'fs';
import * as path from 'path';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaAsset } from './entities/media-asset.entity';
import { CreateMediaAssetDto } from './dto/create-media-asset.dto';
import { UpdateMediaAssetDto } from './dto/update-media-asset.dto';

export interface MediaAssetFilters {
  type?: string;
  category?: string;
  search?: string;
  tags?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

@Injectable()
export class MediaAssetService {
  private readonly logger = new Logger(MediaAssetService.name);

  constructor(
    @InjectRepository(MediaAsset)
    private readonly repository: Repository<MediaAsset>,
  ) {}

  private detectMediaType(mimeType: string): 'image' | 'video' | 'audio' | 'document' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  }

  private buildPublicUrl(filePath: string): string {
    const domain = (process.env.APP_DOMAIN || process.env.APP_URL || '').replace(/\/$/, '');
    return `${domain}/${filePath}`;
  }

  buildPreviewUrl(id: string): string {
    const domain = (process.env.APP_DOMAIN || process.env.APP_URL || '').replace(/\/$/, '');
    return `${domain}/media/preview/${id}`;
  }

  private hydrateUrl(asset: MediaAsset): MediaAsset {
    asset.publicUrl = this.buildPublicUrl(asset.filePath);
    return asset;
  }

  async findAll(
    filters: MediaAssetFilters,
  ): Promise<{ items: MediaAsset[]; total: number; pages: number }> {
    const {
      type,
      category,
      search,
      tags,
      page = 1,
      limit = 20,
      sort = 'createdAt',
      order = 'desc',
    } = filters;

    const qb = this.repository.createQueryBuilder('asset');

    if (type && type !== 'all') {
      qb.andWhere('asset.mediaType = :type', { type });
    }
    if (category) {
      qb.andWhere('asset.category = :category', { category });
    }
    if (search) {
      qb.andWhere(
        '(asset.name LIKE :search OR asset.originalName LIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (tags) {
      const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        const tagConditions = tagList.map((_, i) => `JSON_SEARCH(asset.tags, 'one', :tag${i}) IS NOT NULL`);
        const tagParams: Record<string, string> = {};
        tagList.forEach((t, i) => { tagParams[`tag${i}`] = t; });
        qb.andWhere(`(${tagConditions.join(' OR ')})`, tagParams);
      }
    }

    const allowedSorts: Record<string, string> = {
      name: 'asset.name',
      createdAt: 'asset.createdAt',
      fileSize: 'asset.fileSize',
      usageCount: 'asset.usageCount',
    };
    const sortColumn = allowedSorts[sort] ?? 'asset.createdAt';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const pageNum = page < 1 ? 1 : page;
    const limitNum = limit < 1 ? 20 : Math.min(limit, 100);

    qb.orderBy(sortColumn, sortOrder)
      .skip((pageNum - 1) * limitNum)
      .take(limitNum);

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((a) => this.hydrateUrl(a)),
      total,
      pages: Math.ceil(total / limitNum),
    };
  }

  async findOne(id: string): Promise<MediaAsset> {
    const asset = await this.repository.findOne({ where: { id } });
    if (!asset) {
      throw new NotFoundException(`MediaAsset introuvable : ${id}`);
    }
    return this.hydrateUrl(asset);
  }

  async upload(
    file: Express.Multer.File,
    dto: CreateMediaAssetDto,
  ): Promise<MediaAsset> {
    const domain = process.env.APP_DOMAIN || process.env.APP_URL || '';
    const publicUrl = `${domain}/uploads/media-assets/${file.filename}`;
    const filePath = `uploads/media-assets/${file.filename}`;
    const mediaType = this.detectMediaType(file.mimetype);

    const asset = this.repository.create({
      name: dto.name || file.originalname,
      originalName: file.originalname,
      filePath,
      publicUrl,
      mimeType: file.mimetype,
      mediaType,
      fileSize: file.size,
      category: dto.category ?? null,
      tags: dto.tags ?? null,
      colorLabel: dto.colorLabel ?? null,
      usageCount: 0,
    });

    return this.repository.save(asset);
  }

  async update(id: string, dto: UpdateMediaAssetDto): Promise<MediaAsset> {
    const asset = await this.findOne(id);

    if (dto.name !== undefined) asset.name = dto.name;
    if (dto.category !== undefined) asset.category = dto.category ?? null;
    if (dto.tags !== undefined) asset.tags = dto.tags ?? null;
    if (dto.colorLabel !== undefined) asset.colorLabel = dto.colorLabel ?? null;

    return this.repository.save(asset);
  }

  async remove(id: string): Promise<void> {
    const asset = await this.findOne(id);

    if (asset.usageCount > 0) {
      throw new ConflictException(
        `Ce média est utilisé dans ${asset.usageCount} lien(s) campagne. Détachez-le d'abord.`,
      );
    }

    const absolutePath = path.join(process.cwd(), asset.filePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      this.logger.log(`Fichier supprimé : ${absolutePath}`);
    }

    await this.repository.remove(asset);
  }

  async getCategories(): Promise<string[]> {
    const rows = await this.repository
      .createQueryBuilder('asset')
      .select('DISTINCT asset.category', 'category')
      .where('asset.category IS NOT NULL')
      .getRawMany<{ category: string }>();
    return rows.map((r) => r.category).filter(Boolean);
  }

  async incrementUsage(id: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(MediaAsset)
      .set({ usageCount: () => 'usage_count + 1' })
      .where('id = :id', { id })
      .execute();
  }

  async decrementUsage(id: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(MediaAsset)
      .set({ usageCount: () => 'GREATEST(0, usage_count - 1)' })
      .where('id = :id', { id })
      .execute();
  }
}
