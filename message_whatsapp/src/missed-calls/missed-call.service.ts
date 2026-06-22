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

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const [statusRows, todayCount, slaRow, avgRow, overdueRows] = await Promise.all([
      // Comptage par statut (90 derniers jours)
      this.repo
        .createQueryBuilder('mc')
        .select('mc.status', 'status')
        .addSelect('COUNT(*)', 'cnt')
        .where('mc.occurredAt >= :cutoff', { cutoff })
        .groupBy('mc.status')
        .getRawMany<{ status: string; cnt: string }>(),

      // Total aujourd'hui
      this.repo
        .createQueryBuilder('mc')
        .where('mc.occurredAt >= :start', { start: todayStart })
        .getCount(),

      // SLA : called_back avec et sans breach (90j)
      this.repo
        .createQueryBuilder('mc')
        .select('COUNT(*)', 'resolvedTotal')
        .addSelect(
          'SUM(CASE WHEN mc.slaBreachedAt IS NULL THEN 1 ELSE 0 END)',
          'inSla',
        )
        .where('mc.status = :status', { status: 'called_back' })
        .andWhere('mc.occurredAt >= :cutoff', { cutoff })
        .getRawOne<{ resolvedTotal: string; inSla: string }>(),

      // Délai moyen de traitement (90j)
      this.repo
        .createQueryBuilder('mc')
        .select('AVG(mc.handlingDelaySeconds)', 'avg')
        .where('mc.status = :status', { status: 'called_back' })
        .andWhere('mc.handlingDelaySeconds IS NOT NULL')
        .andWhere('mc.occurredAt >= :cutoff', { cutoff })
        .getRawOne<{ avg: string | null }>(),

      // Top 5 postes en retard : escalated ou assigned+breached (90j)
      this.repo
        .createQueryBuilder('mc')
        .select('mc.posteId', 'posteId')
        .addSelect('COUNT(*)', 'cnt')
        .where('mc.posteId IS NOT NULL')
        .andWhere(
          '(mc.status = :escalated OR (mc.status = :assigned AND mc.slaBreachedAt IS NOT NULL))',
          { escalated: 'escalated', assigned: 'assigned' },
        )
        .andWhere('mc.occurredAt >= :cutoff', { cutoff })
        .groupBy('mc.posteId')
        .orderBy('cnt', 'DESC')
        .limit(5)
        .getRawMany<{ posteId: string; cnt: string }>(),
    ]);

    const countByStatus = Object.fromEntries(
      statusRows.map((r) => [r.status, parseInt(r.cnt, 10)]),
    ) as Record<string, number>;

    const pending    = countByStatus['pending']     ?? 0;
    const assigned   = countByStatus['assigned']    ?? 0;
    const escalated  = countByStatus['escalated']   ?? 0;
    const calledBack = countByStatus['called_back'] ?? 0;
    const closed     = countByStatus['closed']      ?? 0;

    const resolvedTotal = parseInt(slaRow?.resolvedTotal ?? '0', 10);
    const inSla         = parseInt(slaRow?.inSla         ?? '0', 10);
    const slaRate       = resolvedTotal > 0 ? Math.round((inSla / resolvedTotal) * 100) : 100;

    const avgDelay = avgRow?.avg != null ? Math.round(parseFloat(avgRow.avg)) : null;

    const posteIds     = overdueRows.map((r) => r.posteId);
    const posteNameMap = await this.resolvePosteNames(posteIds);

    const topPostesOverdue = overdueRows.map((r) => ({
      posteId:   r.posteId,
      posteName: posteNameMap.get(r.posteId) ?? null,
      count:     parseInt(r.cnt, 10),
    }));

    return {
      totalToday:              todayCount,
      totalPending:            pending,
      totalAssigned:           assigned,
      totalEscalated:          escalated,
      totalCalledBack:         calledBack,
      totalClosed:             closed,
      slaComplianceRate:       slaRate,
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
      // FIX-M8: Remplacement de la requête SQL brute par QueryBuilder
      const callLogs = await this.commercialRepo.manager
        .getRepository('call_log')
        .createQueryBuilder('cl')
        .select(['cl.callEventExternalId', 'cl.commercialName'])
        .where('cl.callEventExternalId IN (:...ids)', { ids: callbackEventIds })
        .getRawMany<{ cl_call_event_external_id: string; cl_commercial_name: string }>();
      for (const cl of callLogs) {
        callbackCommercialMap.set(cl.cl_call_event_external_id, cl.cl_commercial_name);
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

