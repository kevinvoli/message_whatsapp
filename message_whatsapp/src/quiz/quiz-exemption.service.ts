import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { QuizExemption } from './entities/quiz-exemption.entity';
import { CreateExemptionDto } from './dto/create-exemption.dto';

@Injectable()
export class QuizExemptionService {
  constructor(
    @InjectRepository(QuizExemption)
    private readonly exemptionRepo: Repository<QuizExemption>,
  ) {}

  async createExemption(dto: CreateExemptionDto): Promise<QuizExemption> {
    const exemption = this.exemptionRepo.create({
      scope: dto.scope,
      commercialId: dto.commercialId ?? null,
      posteId: dto.posteId ?? null,
      reason: dto.reason ?? null,
    });
    return this.exemptionRepo.save(exemption);
  }

  async findAllExemptions(): Promise<QuizExemption[]> {
    return this.exemptionRepo.find({ where: { deletedAt: IsNull() } });
  }

  async removeExemption(id: string): Promise<void> {
    await this.exemptionRepo.softDelete(id);
  }

  async isExempt(commercialId: string, posteId: string | null): Promise<boolean> {
    const qb = this.exemptionRepo
      .createQueryBuilder('e')
      .where('e.deletedAt IS NULL')
      .andWhere(
        '(e.scope = :scopeCommercial AND e.commercialId = :commercialId)' +
          (posteId ? ' OR (e.scope = :scopePoste AND e.posteId = :posteId)' : ''),
        {
          scopeCommercial: 'commercial',
          commercialId,
          ...(posteId ? { scopePoste: 'poste', posteId } : {}),
        },
      );

    const count = await qb.getCount();
    return count > 0;
  }
}
