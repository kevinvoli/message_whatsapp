import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { FollowUp, FollowUpStatus } from './entities/follow_up.entity';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { CompleteFollowUpDto } from './dto/complete-follow-up.dto';

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(
    @InjectRepository(FollowUp)
    private readonly repo: Repository<FollowUp>,
  ) {}

  async create(dto: CreateFollowUpDto, commercial_id: string, commercial_name: string): Promise<FollowUp> {
    const entity = this.repo.create({
      ...dto,
      scheduled_at: new Date(dto.scheduled_at),
      commercial_id,
      commercial_name,
      status: FollowUpStatus.PLANIFIEE,
    });
    return this.repo.save(entity);
  }

  async findByContact(contact_id: string): Promise<FollowUp[]> {
    return this.repo.find({
      where: { contact_id },
      order: { scheduled_at: 'ASC' },
    });
  }

  async findByCommercial(
    commercial_id: string,
    status?: FollowUpStatus,
    limit = 50,
    offset = 0,
  ): Promise<{ data: FollowUp[]; total: number }> {
    const where: Record<string, unknown> = { commercial_id };
    if (status) where.status = status;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { scheduled_at: 'ASC' },
      take: limit,
      skip: offset,
    });
    return { data, total };
  }

  async findDueToday(commercial_id?: string): Promise<FollowUp[]> {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const qb = this.repo
      .createQueryBuilder('f')
      .where('f.status IN (:...statuses)', { statuses: [FollowUpStatus.PLANIFIEE, FollowUpStatus.EN_RETARD] })
      .andWhere('f.scheduled_at <= :endOfDay', { endOfDay })
      .andWhere('f.deletedAt IS NULL')
      .orderBy('f.scheduled_at', 'ASC');

    if (commercial_id) {
      qb.andWhere('f.commercial_id = :commercial_id', { commercial_id });
    }

    return qb.getMany();
  }

  async complete(id: string, commercial_id: string, dto: CompleteFollowUpDto): Promise<FollowUp> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Relance ${id} introuvable`);
    if (entity.commercial_id !== commercial_id) throw new NotFoundException(`Relance ${id} introuvable`);

    entity.status = FollowUpStatus.EFFECTUEE;
    entity.completed_at = new Date();
    entity.result = dto.result ?? null;
    if (dto.notes) entity.notes = dto.notes;
    return this.repo.save(entity);
  }

  async cancel(id: string, commercial_id: string): Promise<FollowUp> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Relance ${id} introuvable`);
    if (entity.commercial_id !== commercial_id) throw new NotFoundException(`Relance ${id} introuvable`);

    entity.status = FollowUpStatus.ANNULEE;
    return this.repo.save(entity);
  }

  async findAllAdmin(
    contact_id?: string,
    commercial_id?: string,
    status?: FollowUpStatus,
    limit = 50,
    offset = 0,
  ): Promise<{ data: FollowUp[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder('f')
      .where('f.deletedAt IS NULL')
      .orderBy('f.scheduled_at', 'ASC')
      .take(limit)
      .skip(offset);

    if (contact_id) qb.andWhere('f.contact_id = :contact_id', { contact_id });
    if (commercial_id) qb.andWhere('f.commercial_id = :commercial_id', { commercial_id });
    if (status) qb.andWhere('f.status = :status', { status });

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  /** Cron toutes les 15 minutes — marque comme EN_RETARD les relances planifiées passées */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async markOverdue(): Promise<void> {
    const now = new Date();
    const result = await this.repo
      .createQueryBuilder()
      .update(FollowUp)
      .set({ status: FollowUpStatus.EN_RETARD })
      .where('status = :s', { s: FollowUpStatus.PLANIFIEE })
      .andWhere('scheduled_at < :now', { now })
      .andWhere('deleted_at IS NULL')
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`markOverdue: ${result.affected} relance(s) marquée(s) EN_RETARD`);
    }
  }

  async countOverdueByCommercial(commercial_id: string): Promise<number> {
    return this.repo.count({
      where: { commercial_id, status: FollowUpStatus.EN_RETARD },
    });
  }
}
