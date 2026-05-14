import { Injectable, NotFoundException, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { CommercialTarget, TargetMetric, TargetPeriodType } from './entities/commercial_target.entity';
import { CreateTargetDto } from './dto/create-target.dto';
import { WhatsappMessage } from '../whatsapp_message/entities/whatsapp_message.entity';
import { CallLog } from '../call-log/entities/call_log.entity';
import { FollowUp } from '../follow-up/entities/follow_up.entity';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';
import { SystemConfigService } from '../system-config/system-config.service';
import { ConversationReport } from '../gicop-report/entities/conversation-report.entity';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

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
  private readonly RANKING_TTL: Record<string, number> = { today: 30, week: 60, month: 120 };
  private readonly PROGRESS_TTL = 60;
  private readonly PROGRESS_ALL_TTL = 60;

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
    @InjectRepository(ConversationReport)
    private readonly reportRepo: Repository<ConversationReport>,
    private readonly systemConfig: SystemConfigService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
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

  async getRanking(period: 'today' | 'week' | 'month' = 'month'): Promise<CommercialRankingEntry[]> {
    const cacheKey = `ranking:${period}`;
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as CommercialRankingEntry[];
      } catch { /* fallback DB */ }
    }
    const result = await this.computeRanking(period);
    if (this.redis) {
      try { await this.redis.setex(cacheKey, this.RANKING_TTL[period], JSON.stringify(result)); } catch { /* ok */ }
    }
    return result;
  }

  async invalidateRankingCache(): Promise<void> {
    if (!this.redis) return;
    try { await this.redis.del('ranking:today', 'ranking:week', 'ranking:month'); } catch { /* ok */ }
  }

  async getProgress(commercialId: string): Promise<TargetProgressDto[]> {
    const cacheKey = `progress:${commercialId}`;
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as TargetProgressDto[];
      } catch { /* fallback DB */ }
    }
    const targets = await this.findAll(commercialId);
    if (targets.length === 0) return [];
    const result = await this.computeProgressBatch(targets);
    if (this.redis) {
      try { await this.redis.setex(cacheKey, this.PROGRESS_TTL, JSON.stringify(result)); } catch { /* ok */ }
    }
    return result;
  }

  async invalidateProgressCache(commercialId: string): Promise<void> {
    if (!this.redis) return;
    try { await this.redis.del(`progress:${commercialId}`); } catch { /* ok */ }
  }

  async getProgressAll(): Promise<TargetProgressDto[]> {
    const cacheKey = 'progress:all';
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as TargetProgressDto[];
      } catch { /* fallback DB */ }
    }
    const targets = await this.findAll();
    if (targets.length === 0) return [];
    const result = await this.computeProgressBatch(targets);
    if (this.redis) {
      try { await this.redis.setex(cacheKey, this.PROGRESS_ALL_TTL, JSON.stringify(result)); } catch { /* ok */ }
    }
    return result;
  }

  async invalidateProgressAllCache(): Promise<void> {
    if (!this.redis) return;
    try { await this.redis.del('progress:all'); } catch { /* ok */ }
  }

  private async computeRanking(period: 'today' | 'week' | 'month' = 'month'): Promise<CommercialRankingEntry[]> {
    const { start, end } = this.rankingPeriodRange(period);

    type MsgRow = { commercial_id: string; conv_cnt: string; msg_cnt: string };
    type Row = { commercial_id: string; cnt: string };

    const [msgConvRows, callRows, fuRows, orderRows] = await Promise.all([
      this.messageRepo
        .createQueryBuilder('m')
        .select('m.commercial_id', 'commercial_id')
        .addSelect('COUNT(DISTINCT m.chat_id)', 'conv_cnt')
        .addSelect('COUNT(*)', 'msg_cnt')
        .where('m.commercial_id IS NOT NULL')
        .andWhere('m.direction = :dir', { dir: 'OUT' })
        .andWhere('m.createdAt >= :start', { start })
        .andWhere('m.createdAt < :end', { end })
        .andWhere('m.deletedAt IS NULL')
        .groupBy('m.commercial_id')
        .getRawMany<MsgRow>(),

      this.callLogRepo
        .createQueryBuilder('cl')
        .select('cl.commercial_id', 'commercial_id')
        .addSelect('COUNT(*)', 'cnt')
        .where('cl.commercial_id IS NOT NULL')
        .andWhere('cl.createdAt >= :start', { start })
        .andWhere('cl.createdAt < :end', { end })
        .groupBy('cl.commercial_id')
        .getRawMany<Row>(),

      this.followUpRepo
        .createQueryBuilder('f')
        .select('f.commercial_id', 'commercial_id')
        .addSelect('COUNT(*)', 'cnt')
        .where('f.commercial_id IS NOT NULL')
        .andWhere('f.status = :status', { status: 'effectuee' })
        .andWhere('f.completed_at >= :start', { start })
        .andWhere('f.completed_at < :end', { end })
        .groupBy('f.commercial_id')
        .getRawMany<Row>(),

      this.messageRepo
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
        .getRawMany<Row>(),
    ]);

    const allIds = new Set<string>([
      ...msgConvRows.map((r) => r.commercial_id),
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

    const convMap  = new Map(msgConvRows.map((r) => [r.commercial_id, parseInt(r.conv_cnt, 10) || 0]));
    const msgMap   = new Map(msgConvRows.map((r) => [r.commercial_id, parseInt(r.msg_cnt,  10) || 0]));
    const callMap  = toMap(callRows);
    const fuMap    = toMap(fuRows);
    const orderMap = toMap(orderRows);

    const weights = await this.getRankingWeights();

    const entries: CommercialRankingEntry[] = Array.from(allIds).map((id) => {
      const conversations = convMap.get(id)  ?? 0;
      const messages_sent = msgMap.get(id)   ?? 0;
      const calls         = callMap.get(id)  ?? 0;
      const follow_ups    = fuMap.get(id)    ?? 0;
      const orders        = orderMap.get(id) ?? 0;
      const score =
        orders        * weights.orders        +
        conversations * weights.conversations  +
        calls         * weights.calls          +
        follow_ups    * weights.follow_ups     +
        Math.floor(messages_sent * weights.messages);
      const comm = commMap.get(id);
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

  private async computeProgressBatch(targets: CommercialTarget[]): Promise<TargetProgressDto[]> {
    const allIds = [...new Set(targets.map((t) => t.commercial_id))];

    const dates = targets.flatMap((t) => {
      const { start, end } = this.periodRange(t);
      return [start, end];
    });
    const globalStart = new Date(Math.min(...dates.map((d) => d.getTime())));
    const globalEnd   = new Date(Math.max(...dates.map((d) => d.getTime())));

    const [convRows, callRows, fuRows, orderRows, reportRows] = await Promise.all([
      this.messageRepo
        .createQueryBuilder('m')
        .select('m.commercial_id', 'commercial_id')
        .addSelect('DATE(m.createdAt)', 'day')
        .addSelect('COUNT(DISTINCT m.chat_id)', 'cnt')
        .where('m.commercial_id IN (:...allIds)', { allIds })
        .andWhere('m.direction = :dir', { dir: 'OUT' })
        .andWhere('m.createdAt >= :globalStart', { globalStart })
        .andWhere('m.createdAt < :globalEnd', { globalEnd })
        .andWhere('m.deletedAt IS NULL')
        .groupBy('m.commercial_id, DATE(m.createdAt)')
        .getRawMany<{ commercial_id: string; day: string; cnt: string }>(),

      this.callLogRepo
        .createQueryBuilder('cl')
        .select('cl.commercial_id', 'commercial_id')
        .addSelect('DATE(cl.createdAt)', 'day')
        .addSelect('COUNT(*)', 'cnt')
        .where('cl.commercial_id IN (:...allIds)', { allIds })
        .andWhere('cl.createdAt >= :globalStart', { globalStart })
        .andWhere('cl.createdAt < :globalEnd', { globalEnd })
        .groupBy('cl.commercial_id, DATE(cl.createdAt)')
        .getRawMany<{ commercial_id: string; day: string; cnt: string }>(),

      this.followUpRepo
        .createQueryBuilder('f')
        .select('f.commercial_id', 'commercial_id')
        .addSelect('DATE(f.completed_at)', 'day')
        .addSelect('COUNT(*)', 'cnt')
        .where('f.commercial_id IN (:...allIds)', { allIds })
        .andWhere("f.status = 'effectuee'")
        .andWhere('f.completed_at >= :globalStart', { globalStart })
        .andWhere('f.completed_at < :globalEnd', { globalEnd })
        .groupBy('f.commercial_id, DATE(f.completed_at)')
        .getRawMany<{ commercial_id: string; day: string; cnt: string }>(),

      this.messageRepo
        .createQueryBuilder('m')
        .innerJoin(
          'whatsapp_chat', 'c',
          `c.chat_id = m.chat_id AND c.conversation_result IN ('commande_confirmee','commande_a_saisir') AND c.deletedAt IS NULL`,
        )
        .select('m.commercial_id', 'commercial_id')
        .addSelect('DATE(m.createdAt)', 'day')
        .addSelect('COUNT(DISTINCT m.chat_id)', 'cnt')
        .where('m.commercial_id IN (:...allIds)', { allIds })
        .andWhere('m.direction = :dir', { dir: 'OUT' })
        .andWhere('m.createdAt >= :globalStart', { globalStart })
        .andWhere('m.createdAt < :globalEnd', { globalEnd })
        .andWhere('m.deletedAt IS NULL')
        .groupBy('m.commercial_id, DATE(m.createdAt)')
        .getRawMany<{ commercial_id: string; day: string; cnt: string }>(),

      this.reportRepo
        .createQueryBuilder('r')
        .select('r.commercialId', 'commercial_id')
        .addSelect('DATE(r.submittedAt)', 'day')
        .addSelect('COUNT(*)', 'cnt')
        .where('r.commercialId IN (:...allIds)', { allIds })
        .andWhere('r.isSubmitted = true')
        .andWhere('r.submittedAt >= :globalStart', { globalStart })
        .andWhere('r.submittedAt < :globalEnd', { globalEnd })
        .groupBy('r.commercialId, DATE(r.submittedAt)')
        .getRawMany<{ commercial_id: string; day: string; cnt: string }>(),
    ]);

    const toAggMap = (rows: { commercial_id: string; day: string; cnt: string }[]) => {
      const m = new Map<string, Map<string, number>>();
      for (const r of rows) {
        if (!m.has(r.commercial_id)) m.set(r.commercial_id, new Map());
        m.get(r.commercial_id)!.set(r.day, parseInt(r.cnt, 10) || 0);
      }
      return m;
    };

    const convAgg   = toAggMap(convRows);
    const callAgg   = toAggMap(callRows);
    const fuAgg     = toAggMap(fuRows);
    const orderAgg  = toAggMap(orderRows);
    const reportAgg = toAggMap(reportRows);

    const sumInRange = (
      aggMap: Map<string, Map<string, number>>,
      commercialId: string,
      start: Date,
      end: Date,
    ): number => {
      const dayMap = aggMap.get(commercialId);
      if (!dayMap) return 0;
      let total = 0;
      const cursor = new Date(start);
      while (cursor < end) {
        total += dayMap.get(cursor.toISOString().slice(0, 10)) ?? 0;
        cursor.setDate(cursor.getDate() + 1);
      }
      return total;
    };

    return targets.map((target) => {
      const { start, end } = this.periodRange(target);
      let current_value = 0;
      switch (target.metric) {
        case TargetMetric.Conversations:    current_value = sumInRange(convAgg,   target.commercial_id, start, end); break;
        case TargetMetric.Calls:            current_value = sumInRange(callAgg,   target.commercial_id, start, end); break;
        case TargetMetric.FollowUps:
        case TargetMetric.Relances:         current_value = sumInRange(fuAgg,     target.commercial_id, start, end); break;
        case TargetMetric.Orders:           current_value = sumInRange(orderAgg,  target.commercial_id, start, end); break;
        case TargetMetric.ReportsSubmitted: current_value = sumInRange(reportAgg, target.commercial_id, start, end); break;
      }
      const progress_pct = target.target_value > 0
        ? Math.round((current_value / target.target_value) * 100)
        : 0;
      return { target, current_value, progress_pct, period_label: this.periodLabel(target) };
    });
  }

  async getRankingWeights(): Promise<{
    orders: number; conversations: number; calls: number; follow_ups: number; messages: number;
  }> {
    const parse = (v: string | null, def: number) => {
      const n = parseFloat(v ?? '');
      return isNaN(n) ? def : n;
    };
    const [o, c, cl, fu, m] = await Promise.all([
      this.systemConfig.get('RANKING_WEIGHT_ORDERS'),
      this.systemConfig.get('RANKING_WEIGHT_CONVERSATIONS'),
      this.systemConfig.get('RANKING_WEIGHT_CALLS'),
      this.systemConfig.get('RANKING_WEIGHT_FOLLOW_UPS'),
      this.systemConfig.get('RANKING_WEIGHT_MESSAGES'),
    ]);
    return {
      orders:        parse(o,  5),
      conversations: parse(c,  3),
      calls:         parse(cl, 2),
      follow_ups:    parse(fu, 2),
      messages:      parse(m,  0.1),
    };
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
