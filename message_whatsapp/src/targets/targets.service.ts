import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { CommercialTarget, TargetMetric, TargetPeriodType } from './entities/commercial_target.entity';
import { CreateTargetDto } from './dto/create-target.dto';
import { WhatsappMessage } from '../whatsapp_message/entities/whatsapp_message.entity';
import { CallLog } from '../call-log/entities/call_log.entity';
import { FollowUp } from '../follow-up/entities/follow_up.entity';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';

export interface CommercialRankingEntry {
  rank: number;
  commercial_id: string;
  commercial_name: string;
  commercial_email: string;
  conversations: number;
  messages_sent: number;
  calls: number;
  follow_ups: number;
  orders: number;
  score: number;
}

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
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
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

  async getRanking(period: 'today' | 'week' | 'month' = 'month'): Promise<CommercialRankingEntry[]> {
    const { start, end } = this.rankingPeriodRange(period);

    type Row = { commercial_id: string; cnt: string };

    const convRows: Row[] = await this.messageRepo
      .createQueryBuilder('m')
      .select('m.commercial_id', 'commercial_id')
      .addSelect('COUNT(DISTINCT m.chat_id)', 'cnt')
      .where('m.commercial_id IS NOT NULL')
      .andWhere('m.direction = :dir', { dir: 'OUT' })
      .andWhere('m.createdAt >= :start', { start })
      .andWhere('m.createdAt < :end', { end })
      .andWhere('m.deletedAt IS NULL')
      .groupBy('m.commercial_id')
      .getRawMany();

    const msgRows: Row[] = await this.messageRepo
      .createQueryBuilder('m')
      .select('m.commercial_id', 'commercial_id')
      .addSelect('COUNT(*)', 'cnt')
      .where('m.commercial_id IS NOT NULL')
      .andWhere('m.direction = :dir', { dir: 'OUT' })
      .andWhere('m.createdAt >= :start', { start })
      .andWhere('m.createdAt < :end', { end })
      .andWhere('m.deletedAt IS NULL')
      .groupBy('m.commercial_id')
      .getRawMany();

    const callRows: Row[] = await this.callLogRepo
      .createQueryBuilder('cl')
      .select('cl.commercial_id', 'commercial_id')
      .addSelect('COUNT(*)', 'cnt')
      .where('cl.commercial_id IS NOT NULL')
      .andWhere('cl.createdAt >= :start', { start })
      .andWhere('cl.createdAt < :end', { end })
      .groupBy('cl.commercial_id')
      .getRawMany();

    const fuRows: Row[] = await this.followUpRepo
      .createQueryBuilder('f')
      .select('f.commercial_id', 'commercial_id')
      .addSelect('COUNT(*)', 'cnt')
      .where('f.commercial_id IS NOT NULL')
      .andWhere('f.status = :status', { status: 'effectuee' })
      .andWhere('f.completed_at >= :start', { start })
      .andWhere('f.completed_at < :end', { end })
      .groupBy('f.commercial_id')
      .getRawMany();

    const orderRows: Row[] = await this.messageRepo
      .createQueryBuilder('m')
      .innerJoin(
        'whatsapp_chat',
        'c',
        `c.chat_id = m.chat_id AND c.conversation_result IN ('commande_confirmee','commande_a_saisir') AND c.deletedAt IS NULL`,
      )
      .select('m.commercial_id', 'commercial_id')
      .addSelect('COUNT(DISTINCT m.chat_id)', 'cnt')
      .where('m.commercial_id IS NOT NULL')
      .andWhere('m.direction = :dir', { dir: 'OUT' })
      .andWhere('m.createdAt >= :start', { start })
      .andWhere('m.createdAt < :end', { end })
      .andWhere('m.deletedAt IS NULL')
      .groupBy('m.commercial_id')
      .getRawMany();

    const allIds = new Set<string>([
      ...convRows.map((r) => r.commercial_id),
      ...callRows.map((r) => r.commercial_id),
      ...fuRows.map((r) => r.commercial_id),
    ]);

    if (allIds.size === 0) return [];

    const commercials = await this.commercialRepo.find({
      select: ['id', 'name', 'email'],
      where: { id: In(Array.from(allIds)) },
    });
    const commMap = new Map(commercials.map((c) => [c.id, c]));

    const toMap = (rows: Row[]) =>
      new Map(rows.map((r) => [r.commercial_id, parseInt(r.cnt, 10) || 0]));

    const convMap  = toMap(convRows);
    const msgMap   = toMap(msgRows);
    const callMap  = toMap(callRows);
    const fuMap    = toMap(fuRows);
    const orderMap = toMap(orderRows);

    const entries: CommercialRankingEntry[] = Array.from(allIds).map((id) => {
      const conversations = convMap.get(id)  ?? 0;
      const messages_sent = msgMap.get(id)   ?? 0;
      const calls         = callMap.get(id)  ?? 0;
      const follow_ups    = fuMap.get(id)    ?? 0;
      const orders        = orderMap.get(id) ?? 0;
      const score = orders * 5 + conversations * 3 + calls * 2 + follow_ups * 2 + Math.floor(messages_sent * 0.1);
      const comm  = commMap.get(id);
      return {
        rank: 0,
        commercial_id:    id,
        commercial_name:  comm?.name  ?? id,
        commercial_email: comm?.email ?? '',
        conversations,
        messages_sent,
        calls,
        follow_ups,
        orders,
        score,
      };
    });

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, i) => { e.rank = i + 1; });
    return entries;
  }

  private rankingPeriodRange(period: 'today' | 'week' | 'month'): { start: Date; end: Date } {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);

    const start = new Date(now);
    if (period === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }

    return { start, end };
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
