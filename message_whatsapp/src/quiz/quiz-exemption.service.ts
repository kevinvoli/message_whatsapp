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
    // Requête SQL brute pour éviter que TypeORM résolve whatsapp_commercial/whatsapp_poste
    // comme entités et injecte des filtres automatiques (soft-delete) incompatibles.
    const rows: Array<{
      id: string;
      scope: 'commercial' | 'poste';
      commercial_id: string | null;
      commercial_name: string | null;
      poste_id: string | null;
      poste_name: string | null;
      reason: string | null;
      created_at: Date;
    }> = await this.exemptionRepo.query(`
      SELECT
        e.id,
        e.scope,
        e.commercial_id,
        c.name AS commercial_name,
        e.poste_id,
        p.name AS poste_name,
        e.reason,
        e.created_at
      FROM quiz_exemption e
      LEFT JOIN whatsapp_commercial c ON c.id = e.commercial_id
      LEFT JOIN whatsapp_poste p ON p.id = e.poste_id
      WHERE e.deleted_at IS NULL
      ORDER BY e.created_at DESC
    `);

    return rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      commercialId: r.commercial_id,
      commercialName: r.commercial_name,
      posteId: r.poste_id,
      posteName: r.poste_name,
      reason: r.reason,
      createdAt: r.created_at,
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
