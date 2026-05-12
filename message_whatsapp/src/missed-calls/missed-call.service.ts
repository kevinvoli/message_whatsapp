import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { MissedCallEvent, MissedCallEventStatus } from './entities/missed-call-event.entity';

export interface MissedCallMetrics {
  totalToday: number;
  totalPending: number;
  totalAssigned: number;
  totalEscalated: number;
  totalCalledBack: number;
  totalClosed: number;
  slaComplianceRate: number; // 0–100
  avgHandlingDelaySeconds: number | null;
  topPostesOverdue: Array<{ posteId: string; count: number }>;
}

export interface MissedCallRow {
  id: string;
  source: string;
  clientPhone: string;
  clientName: string | null;
  posteId: string | null;
  commercialId: string | null;
  status: MissedCallEventStatus;
  occurredAt: string;
  slaBreachedAt: string | null;
  callbackDoneAt: string | null;
  handlingDelaySeconds: number | null;
  callbackTaskId: string | null;
}

export interface MissedCallListResult {
  items: MissedCallRow[];
  total: number;
}

@Injectable()
export class MissedCallService {
  constructor(
    @InjectRepository(MissedCallEvent)
    private readonly repo: Repository<MissedCallEvent>,
  ) {}

  async getMetrics(): Promise<MissedCallMetrics> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [all, todayEvents] = await Promise.all([
      this.repo.find(),
      this.repo.createQueryBuilder('mc')
        .where('mc.occurred_at >= :start', { start: todayStart })
        .getMany(),
    ]);

    const pending    = all.filter((m) => m.status === 'pending').length;
    const assigned   = all.filter((m) => m.status === 'assigned').length;
    const escalated  = all.filter((m) => m.status === 'escalated').length;
    const calledBack = all.filter((m) => m.status === 'called_back').length;
    const closed     = all.filter((m) => m.status === 'closed').length;

    // SLA compliance: called_back without slaBreachedAt / total resolved
    const resolved   = all.filter((m) => m.status === 'called_back' || m.status === 'closed');
    const inSla      = resolved.filter((m) => m.status === 'called_back' && !m.slaBreachedAt);
    const slaRate    = resolved.length > 0 ? Math.round((inSla.length / resolved.length) * 100) : 100;

    // Average handling delay (only called_back with a value)
    const withDelay  = all.filter((m) => m.handlingDelaySeconds !== null && m.status === 'called_back');
    const avgDelay   = withDelay.length > 0
      ? Math.round(withDelay.reduce((sum, m) => sum + (m.handlingDelaySeconds ?? 0), 0) / withDelay.length)
      : null;

    // Top postes overdue (escalated + still assigned past dueAt)
    const overdue    = all.filter((m) => m.status === 'escalated' || (m.status === 'assigned' && m.slaBreachedAt));
    const posteMap   = new Map<string, number>();
    for (const m of overdue) {
      if (m.posteId) {
        posteMap.set(m.posteId, (posteMap.get(m.posteId) ?? 0) + 1);
      }
    }
    const topPostes = Array.from(posteMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([posteId, count]) => ({ posteId, count }));

    return {
      totalToday:           todayEvents.length,
      totalPending:         pending,
      totalAssigned:        assigned,
      totalEscalated:       escalated,
      totalCalledBack:      calledBack,
      totalClosed:          closed,
      slaComplianceRate:    slaRate,
      avgHandlingDelaySeconds: avgDelay,
      topPostesOverdue:     topPostes,
    };
  }

  async list(params: {
    status?: MissedCallEventStatus;
    posteId?: string;
    commercialId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }): Promise<MissedCallListResult> {
    const { status, posteId, commercialId, dateFrom, dateTo, page = 1, limit = 50 } = params;

    const qb = this.repo.createQueryBuilder('mc').orderBy('mc.occurredAt', 'DESC');

    if (status)       qb.andWhere('mc.status = :status', { status });
    if (posteId)      qb.andWhere('mc.posteId = :posteId', { posteId });
    if (commercialId) qb.andWhere('mc.commercialId = :commercialId', { commercialId });
    if (dateFrom)     qb.andWhere('mc.occurredAt >= :dateFrom', { dateFrom: new Date(dateFrom) });
    if (dateTo)       qb.andWhere('mc.occurredAt <= :dateTo',   { dateTo:   new Date(dateTo) });

    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    const [events, total] = await qb.getManyAndCount();

    const items: MissedCallRow[] = events.map((m) => ({
      id:                   m.id,
      source:               m.source,
      clientPhone:          m.clientPhone,
      clientName:           m.clientName,
      posteId:              m.posteId,
      commercialId:         m.commercialId,
      status:               m.status,
      occurredAt:           m.occurredAt.toISOString(),
      slaBreachedAt:        m.slaBreachedAt?.toISOString() ?? null,
      callbackDoneAt:       m.callbackDoneAt?.toISOString() ?? null,
      handlingDelaySeconds: m.handlingDelaySeconds,
      callbackTaskId:       m.callbackTaskId,
    }));

    return { items, total };
  }

  async closeManually(id: string): Promise<void> {
    await this.repo.update(id, { status: 'closed' });
  }
}
