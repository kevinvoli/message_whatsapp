import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { CannedResponse } from './entities/canned-response.entity';
import { CreateCannedResponseDto } from './dto/create-canned-response.dto';
import { UpdateCannedResponseDto } from './dto/update-canned-response.dto';

@Injectable()
export class CannedResponseService {
  constructor(
    @InjectRepository(CannedResponse)
    private readonly repo: Repository<CannedResponse>,
  ) {}

  async create(dto: CreateCannedResponseDto): Promise<CannedResponse> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(
    tenantId: string,
    posteId?: string,
    search?: string,
    category?: string,
  ): Promise<CannedResponse[]> {
    const qb = this.repo
      .createQueryBuilder('cr')
      .where('cr.tenant_id = :tenantId', { tenantId })
      .andWhere('cr.deleted_at IS NULL')
      .andWhere('cr.is_active = true');

    // Filtre poste : réponses du poste ET réponses globales (poste_id IS NULL)
    if (posteId) {
      qb.andWhere('(cr.poste_id = :posteId OR cr.poste_id IS NULL)', { posteId });
    }

    if (search) {
      qb.andWhere(
        '(cr.shortcode LIKE :search OR cr.title LIKE :search OR cr.body LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (category) {
      qb.andWhere('cr.category = :category', { category });
    }

    return qb.orderBy('cr.shortcode', 'ASC').getMany();
  }

  async findOne(id: string, tenantId: string): Promise<CannedResponse> {
    const entity = await this.repo.findOne({ where: { id, tenant_id: tenantId } });
    if (!entity) throw new NotFoundException(`CannedResponse ${id} introuvable`);
    return entity;
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateCannedResponseDto,
  ): Promise<CannedResponse> {
    const entity = await this.findOne(id, tenantId);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const entity = await this.findOne(id, tenantId);
    await this.repo.softDelete(entity.id);
  }

  /** Suggestions pour l'autocomplétion frontend (recherche par shortcode prefix) */
  async suggest(
    tenantId: string,
    prefix: string,
    posteId?: string,
  ): Promise<CannedResponse[]> {
    const qb = this.repo
      .createQueryBuilder('cr')
      .where('cr.tenant_id = :tenantId', { tenantId })
      .andWhere('cr.deleted_at IS NULL')
      .andWhere('cr.is_active = true')
      .andWhere('cr.shortcode LIKE :prefix', { prefix: `${prefix}%` });

    if (posteId) {
      qb.andWhere('(cr.poste_id = :posteId OR cr.poste_id IS NULL)', { posteId });
    }

    return qb.orderBy('cr.shortcode', 'ASC').limit(10).getMany();
  }
}
