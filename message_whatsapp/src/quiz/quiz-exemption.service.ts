import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { QuizExemption } from './entities/quiz-exemption.entity';
import { CreateExemptionDto } from './dto/create-exemption.dto';

export interface ExemptionResult {
  id: string;
  scope: 'commercial' | 'poste';
  commercialId: string | null;
  commercialName: string | null;
  posteId: string | null;
  posteName: string | null;
  reason: string | null;
  createdAt: Date;
}

@Injectable()
export class QuizExemptionService {
  constructor(
    @InjectRepository(QuizExemption)
    private readonly exemptionRepo: Repository<QuizExemption>,
  ) {}

  async createExemption(dto: CreateExemptionDto): Promise<QuizExemption> {
    if (dto.scope === 'commercial' && !dto.commercialId) {
      throw new BadRequestException('commercialId est requis pour scope=commercial');
    }
    if (dto.scope === 'poste' && !dto.posteId) {
      throw new BadRequestException('posteId est requis pour scope=poste');
    }

    const scopeId = dto.scope === 'commercial' ? dto.commercialId : dto.posteId;
    const existing = await this.findActiveExemptionByScope(dto.scope, scopeId!);
    if (existing) return existing;

    const exemption = this.exemptionRepo.create({
      scope: dto.scope,
      commercialId: dto.scope === 'commercial' ? dto.commercialId : null,
      posteId: dto.scope === 'poste' ? dto.posteId : null,
      reason: dto.reason ?? null,
    });
    try {
      return await this.exemptionRepo.save(exemption);
    } catch (err: unknown) {
      const mysqlErr = err as { errno?: number };
      if (mysqlErr?.errno === 1062) {
        throw new ConflictException('Cette exemption existe déjà');
      }
      throw err;
    }
  }

  async findAllExemptions(): Promise<ExemptionResult[]> {
    const rows = await this.exemptionRepo
      .createQueryBuilder('e')
      .leftJoin('whatsapp_commercial', 'c', 'c.id = e.commercialId')
      .leftJoin('whatsapp_poste', 'p', 'p.id = e.posteId')
      .select([
        'e.id AS id',
        'e.scope AS scope',
        'e.commercialId AS commercialId',
        'c.name AS commercialName',
        'e.posteId AS posteId',
        'p.name AS posteName',
        'e.reason AS reason',
        'e.createdAt AS createdAt',
      ])
      .where('e.deletedAt IS NULL')
      .orderBy('e.createdAt', 'DESC')
      .getRawMany<{
        id: string;
        scope: 'commercial' | 'poste';
        commercialId: string | null;
        commercialName: string | null;
        posteId: string | null;
        posteName: string | null;
        reason: string | null;
        createdAt: Date;
      }>();

    return rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      commercialId: r.commercialId,
      commercialName: r.commercialName,
      posteId: r.posteId,
      posteName: r.posteName,
      reason: r.reason,
      createdAt: r.createdAt,
    }));
  }

  private findActiveExemptionByScope(
    scope: 'commercial' | 'poste',
    scopeId: string,
  ): Promise<QuizExemption | null> {
    const where =
      scope === 'commercial'
        ? 'e.scope = :scope AND e.commercialId = :scopeId AND e.deletedAt IS NULL'
        : 'e.scope = :scope AND e.posteId = :scopeId AND e.deletedAt IS NULL';

    return this.exemptionRepo
      .createQueryBuilder('e')
      .where(where, { scope, scopeId })
      .getOne();
  }

  async removeExemption(id: string): Promise<void> {
    await this.exemptionRepo.delete(id);
  }

  async isExempt(commercialId: string, posteId: string | null): Promise<boolean> {
    const count = await this.exemptionRepo
      .createQueryBuilder('e')
      .where('e.deletedAt IS NULL')
      .andWhere(
        new Brackets((qb) => {
          qb.where('e.scope = :scopeCommercial AND e.commercialId = :commercialId', {
            scopeCommercial: 'commercial',
            commercialId,
          });
          if (posteId) {
            qb.orWhere('e.scope = :scopePoste AND e.posteId = :posteId', {
              scopePoste: 'poste',
              posteId,
            });
          }
        }),
      )
      .getCount();
    return count > 0;
  }
}
