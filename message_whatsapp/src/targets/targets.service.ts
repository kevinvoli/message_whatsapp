import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CommercialTarget, TargetMetric, TargetPeriodType } from './entities/commercial_target.entity';
import { CreateTargetDto } from './dto/create-target.dto';
import { WhatsappMessage } from '../whatsapp_message/entities/whatsapp_message.entity';
import { CallLog } from '../call-log/entities/call_log.entity';
import { FollowUp } from '../follow-up/entities/follow_up.entity';

export interface TargetProgressDto {
  target: CommercialTarget;
  current_value: number;
  progress_pct: number;
  period_label: string;
}

@Injectable()
export class TargetsService {
  constructor(
    @InjectRepository(CommercialTarget)
    private readonly targetRepo: Repository<CommercialTarget>,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepo: Repository<WhatsappMessage>,
    @InjectRepository(CallLog)
    private readonly callLogRepo: Repository<CallLog>,
    @InjectRepository(FollowUp)
    private readonly followUpRepo: Repository<FollowUp>,
  ) {}

  findAll(commercial_id?: string): Promise<CommercialTarget[]> {
    const where: any = { deletedAt: IsNull() };
    if (commercial_id) where.commercial_id = commercial_id;
    return this.targetRepo.find({ where, order: { period_start: 'DESC' } });
  }

  async create(dto: CreateTargetDto, createdBy?: string): Promise<CommercialTarget> {
    const target = this.targetRepo.create({ ...dto, created_by: createdBy ?? null });
    return this.targetRepo.save(target);
  }

  async update(id: string, dto: Partial<CreateTargetDto>): Promise<CommercialTarget> {
    const target = await this.targetRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!target) throw new NotFoundException('Objectif introuvable');
    Object.assign(target, dto);
    return this.targetRepo.save(target);
  }

  async remove(id: string): Promise<void> {
    const target = await this.targetRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!target) throw new NotFoundException('Objectif introuvable');
    await this.targetRepo.softDelete(id);
  }

  async getProgress(commercialId: string): Promise<TargetProgressDto[]> {
    const targets = await this.findAll(commercialId);
    return Promise.all(targets.map((t) => this.buildProgress(t)));
  }

  async getProgressAll(): Promise<TargetProgressDto[]> {
    const targets = await this.findAll();
    return Promise.all(targets.map((t) => this.buildProgress(t)));
  }

  private async buildProgress(target: CommercialTarget): Promise<TargetProgressDto> {
    const current_value = await this.computeProgress(target);
    const progress_pct = target.target_value > 0
      ? Math.round((current_value / target.target_value) * 100)
      : 0;
    return { target, current_value, progress_pct, period_label: this.periodLabel(target) };
  }

  private async computeProgress(target: CommercialTarget): Promise<number> {
    const { start, end } = this.periodRange(target);

    switch (target.metric) {
      case TargetMetric.Conversations:
        return this.messageRepo
          .createQueryBuilder('m')
          .select('COUNT(DISTINCT m.chat_id)', 'cnt')
          .where('m.commercial_id = :id', { id: target.commercial_id })
          .andWhere('m.direction = :dir', { dir: 'OUT' })
          .andWhere('m.createdAt >= :start', { start })
          .andWhere('m.createdAt < :end', { end })
          .andWhere('m.deletedAt IS NULL')
          .getRawOne()
          .then((r) => parseInt(r?.cnt ?? '0') || 0);

      case TargetMetric.Calls:
        return this.callLogRepo
          .createQueryBuilder('cl')
          .where('cl.commercial_id = :id', { id: target.commercial_id })
          .andWhere('cl.createdAt >= :start', { start })
          .andWhere('cl.createdAt < :end', { end })
          .getCount();

      case TargetMetric.FollowUps:
      case TargetMetric.Relances:
        return this.followUpRepo
          .createQueryBuilder('f')
          .where('f.commercial_id = :id', { id: target.commercial_id })
          .andWhere('f.status = :status', { status: 'effectuee' })
          .andWhere('f.completed_at >= :start', { start })
          .andWhere('f.completed_at < :end', { end })
          .getCount();

      case TargetMetric.Orders:
        return this.messageRepo
          .createQueryBuilder('m')
          .innerJoin(
            'whatsapp_chat',
            'c',
            `c.chat_id = m.chat_id AND c.conversation_result IN ('commande_confirmee','commande_a_saisir') AND c.deletedAt IS NULL`,
          )
          .where('m.commercial_id = :id', { id: target.commercial_id })
          .andWhere('m.direction = :dir', { dir: 'OUT' })
          .andWhere('m.createdAt >= :start', { start })
          .andWhere('m.createdAt < :end', { end })
          .andWhere('m.deletedAt IS NULL')
          .select('COUNT(DISTINCT m.chat_id)', 'cnt')
          .getRawOne()
          .then((r) => parseInt(r?.cnt ?? '0') || 0);

      default:
        return 0;
    }
  }

  private periodRange(target: CommercialTarget): { start: Date; end: Date } {
    const start = new Date(target.period_start);
    const end = new Date(start);

    switch (target.period_type) {
      case TargetPeriodType.Day:
        end.setDate(end.getDate() + 1);
        break;
      case TargetPeriodType.Week:
        end.setDate(end.getDate() + 7);
        break;
      case TargetPeriodType.Month:
        end.setMonth(end.getMonth() + 1);
        break;
      case TargetPeriodType.Quarter:
        end.setMonth(end.getMonth() + 3);
        break;
    }
    return { start, end };
  }

  private periodLabel(target: CommercialTarget): string {
    const labels: Record<TargetPeriodType, string> = {
      [TargetPeriodType.Day]: 'Journée',
      [TargetPeriodType.Week]: 'Semaine',
      [TargetPeriodType.Month]: 'Mois',
      [TargetPeriodType.Quarter]: 'Trimestre',
    };
    return `${labels[target.period_type]} du ${target.period_start}`;
  }
}
