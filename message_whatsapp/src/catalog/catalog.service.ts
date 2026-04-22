import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetCategory, InformationCategoryAsset } from './entities/information-category-asset.entity';
import { v4 as uuidv4 } from 'uuid';

export interface CreateAssetDto {
  category: AssetCategory;
  mediaType: InformationCategoryAsset['mediaType'];
  title: string;
  description?: string | null;
  mediaUrl: string;
  textTemplate?: string | null;
  sortOrder?: number;
}

export interface UpdateAssetDto extends Partial<CreateAssetDto> {
  isActive?: boolean;
}

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(InformationCategoryAsset)
    private readonly repo: Repository<InformationCategoryAsset>,
  ) {}

  findAll(category?: AssetCategory, activeOnly = false): Promise<InformationCategoryAsset[]> {
    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (activeOnly) where.isActive = true;
    return this.repo.find({ where, order: { category: 'ASC', sortOrder: 'ASC', title: 'ASC' } });
  }

  findById(id: string): Promise<InformationCategoryAsset | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(dto: CreateAssetDto): Promise<InformationCategoryAsset> {
    return this.repo.save(
      this.repo.create({ id: uuidv4(), ...dto, isActive: true }),
    );
  }

  async update(id: string, dto: UpdateAssetDto): Promise<InformationCategoryAsset> {
    const asset = await this.repo.findOneOrFail({ where: { id } });
    Object.assign(asset, dto);
    return this.repo.save(asset);
  }

  async activate(id: string): Promise<InformationCategoryAsset> {
    return this.update(id, { isActive: true });
  }

  async deactivate(id: string): Promise<InformationCategoryAsset> {
    return this.update(id, { isActive: false });
  }

  async remove(id: string): Promise<void> {
    const asset = await this.repo.findOne({ where: { id } });
    if (!asset) throw new NotFoundException(`Asset ${id} introuvable`);
    await this.repo.remove(asset);
  }
}
