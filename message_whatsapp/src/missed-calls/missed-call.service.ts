import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MissedCallEvent, MissedCallEventStatus } from './entities/missed-call-event.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

export interface MissedCallMetrics {
  totalToday: number;
  totalPending: number;
  totalAssigned: number;
  totalEscalated: number;
  totalCalledBack: number;
  totalClosed: number;
  slaComplianceRate: number;
  avgHandlingDelaySeconds: number | null;
  topPostesOverdue: Array<{ posteId: string; posteName: string | null; count: number }>;
}

export interface MissedCallRow {
  id: string;
  source: string;
  clientPhone: string;
  clientName: string | null;
  posteId: string | null;
  posteName: string | null;
  commercialId: string | null;
  commercialName: string | null;
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

    @InjectRepository(WhatsappPoste)
    private readonly posteRepo: Repository<WhatsappPoste>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
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

    const resolved = all.filter((m) => m.status === 'called_back' || m.status === 'closed');
    const inSla    = resolved.filter((m) => m.status === 'called_back' && !m.slaBreachedAt);
    const slaRate  = resolved.length > 0 ? Math.round((inSla.length / resolved.length) * 100) : 100;

    const withDelay = all.filter((m) => m.handlingDelaySeconds !== null && m.status === 'called_back');
    const avgDelay  = withDelay.length > 0
      ? Math.round(withDelay.reduce((sum, m) => sum + (m.handlingDelaySeconds ?? 0), 0) / withDelay.length)
      : null;

    const overdue  = all.filter((m) => m.status === 'escalated' || (m.status === 'assigned' && m.slaBreachedAt));
    const posteMap = new Map<string, number>();
    for (const m of overdue) {
      if (m.posteId) posteMap.set(m.posteId, (posteMap.get(m.posteId) ?? 0) + 1);
    }
    const topRaw = Array.from(posteMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Résolution des noms de postes
    const posteIds = topRaw.map(([id]) => id);
    const posteNameMap = await this.resolvePosteNames(posteIds);

    const topPostesOverdue = topRaw.map(([posteId, count]) => ({
      posteId,
      posteName: posteNameMap.get(posteId) ?? null,
      count,
    }));

    return {
      totalToday:           todayEvents.length,
      totalPending:         pending,
      totalAssigned:        assigned,
      totalEscalated:       escalated,
      totalCalledBack:      calledBack,
      totalClosed:          closed,
      slaComplianceRate:    slaRate,
      avgHandlingDelaySeconds: avgDelay,
      topPostesOverdue,
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

    qb.skip((page - 1) * limit).take(limit);

    const [events, total] = await qb.getManyAndCount();

    // Résolution des noms en batch
    const posteIds      = [...new Set(events.map((e) => e.posteId).filter((id): id is string => !!id))];
    const commercialIds = [...new Set(events.map((e) => e.commercialId).filter((id): id is string => !!id))];

    const posteNameMap      = await this.resolvePosteNames(posteIds);
    const commercialNameMap = await this.resolveCommercialNames(commercialIds);

    // Pour les absences rappelées sans commercialId direct : résoudre via call_log
    const callbackEventIds = [
      ...new Set(
        events
          .filter((e) => !e.commercialId && e.callbackCallEventId)
          .map((e) => e.callbackCallEventId as string),
      ),
    ];
    let callbackCommercialMap = new Map<string, string>(); // callbackCallEventId → commercialName
    if (callbackEventIds.length > 0) {
      const callLogs = await this.commercialRepo.manager.query(
        `SELECT call_event_external_id, commercial_name FROM call_log WHERE call_event_external_id IN (${callbackEventIds.map(() => '?').join(', ')})`,
        callbackEventIds,
      );
      for (const cl of callLogs as Array<{ call_event_external_id: string; commercial_name: string }>) {
        callbackCommercialMap.set(cl.call_event_external_id, cl.commercial_name);
      }
    }

    const items: MissedCallRow[] = events.map((m) => {
      const commercialName = m.commercialId
        ? (commercialNameMap.get(m.commercialId) ?? null)
        : (m.callbackCallEventId ? (callbackCommercialMap.get(m.callbackCallEventId) ?? null) : null);

      return {
        id:                   m.id,
        source:               m.source,
        clientPhone:          m.clientPhone,
        clientName:           m.clientName,
        posteId:              m.posteId,
        posteName:            m.posteId ? (posteNameMap.get(m.posteId) ?? null) : null,
        commercialId:         m.commercialId,
        commercialName,
        status:               m.status,
        occurredAt:           m.occurredAt.toISOString(),
        slaBreachedAt:        m.slaBreachedAt?.toISOString() ?? null,
        callbackDoneAt:       m.callbackDoneAt?.toISOString() ?? null,
        handlingDelaySeconds: m.handlingDelaySeconds,
        callbackTaskId:       m.callbackTaskId,
      };
    });

    return { items, total };
  }

  async closeManually(id: string): Promise<void> {
    await this.repo.update(id, { status: 'closed' });
  }

  // ── Helpers privés ───────────────────────────────────────────────────────

  private async resolvePosteNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const postes = await this.posteRepo.find({ where: { id: In(ids) }, select: ['id', 'name'] });
    return new Map(postes.map((p) => [p.id, p.name]));
  }

  private async resolveCommercialNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const commercials = await this.commercialRepo.find({ where: { id: In(ids) }, select: ['id', 'name'] });
    return new Map(commercials.map((c) => [c.id, c.name]));
  }

}

