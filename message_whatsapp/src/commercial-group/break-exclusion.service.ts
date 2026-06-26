import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BreakExclusion } from './entities/break-exclusion.entity';
import { CreateBreakExclusionDto } from './dto/sub-group.dto';

@Injectable()
export class BreakExclusionService {
  constructor(
    @InjectRepository(BreakExclusion)
    private readonly exclusionRepo: Repository<BreakExclusion>,
  ) {}

  async create(dto: CreateBreakExclusionDto): Promise<BreakExclusion> {
    const exclusion = this.exclusionRepo.create({
      subGroupId: dto.subGroupId,
      scope: dto.scope,
      posteId: dto.posteId ?? null,
      commercialId: dto.commercialId ?? null,
    });
    return this.exclusionRepo.save(exclusion);
  }

  async findBySubGroup(subGroupId: string): Promise<BreakExclusion[]> {
    return this.exclusionRepo.find({
      where: { subGroupId, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
  }

  async softDelete(id: string): Promise<void> {
    const exclusion = await this.exclusionRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!exclusion) throw new NotFoundException(`BreakExclusion ${id} introuvable`);
    await this.exclusionRepo.softRemove(exclusion);
  }

  async isExcluded(commercialId: string, posteId: string, subGroupId: string): Promise<boolean> {
    const count = await this.exclusionRepo
      .createQueryBuilder('e')
      .where('e.subGroupId = :subGroupId', { subGroupId })
      .andWhere('e.deletedAt IS NULL')
      .andWhere(
        '(e.scope = :scopeC AND e.commercialId = :commercialId) OR (e.scope = :scopeP AND e.posteId = :posteId)',
        { scopeC: 'commercial', commercialId, scopeP: 'poste', posteId },
      )
      .getCount();
    return count > 0;
  }
}
