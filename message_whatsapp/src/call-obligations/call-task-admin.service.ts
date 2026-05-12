import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { CallTask, CallTaskCategory, CallTaskStatus } from './entities/call-task.entity';
import { CommercialObligationBatch } from './entities/commercial-obligation-batch.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

export interface CallTaskMetrics {
  totalToday: number;
  totalPending: number;
  totalDone: number;
  avgDurationSeconds: number | null;
  topPostesOverdue: Array<{ posteId: string; posteName: string | null; count: number }>;
}

export interface CallTaskRow {
  id: string;
  category: CallTaskCategory;
  status: CallTaskStatus;
  clientPhone: string | null;
  callEventId: string | null;
  durationSeconds: number | null;
  completedAt: Date | null;
  createdAt: Date;
  posteId: string;
  posteName: string | null;
  commercialName: string | null;
  batchNumber: number;
}

export interface CallTaskListParams {
  category: CallTaskCategory;
  status?: CallTaskStatus;
  posteId?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}

@Injectable()
export class CallTaskAdminService {
  constructor(
    @InjectRepository(CallTask)
    private readonly callTaskRepo: Repository<CallTask>,

    @InjectRepository(CommercialObligationBatch)
    private readonly batchRepo: Repository<CommercialObligationBatch>,

    @InjectRepository(WhatsappPoste)
    private readonly posteRepo: Repository<WhatsappPoste>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
  ) {}

  async getMetrics(category: CallTaskCategory): Promise<CallTaskMetrics> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalToday, totalPending, totalDone] = await Promise.all([
      this.callTaskRepo.count({
        where: { category, createdAt: Between(todayStart, new Date()) },
      }),
      this.callTaskRepo.count({ where: { category, status: CallTaskStatus.PENDING } }),
      this.callTaskRepo.count({ where: { category, status: CallTaskStatus.DONE } }),
    ]);

    const avgResult = await this.callTaskRepo
      .createQueryBuilder('ct')
      .select('AVG(ct.durationSeconds)', 'avg')
      .where('ct.category = :category', { category })
      .andWhere('ct.status = :status', { status: CallTaskStatus.DONE })
      .andWhere('ct.durationSeconds IS NOT NULL')
      .getRawOne<{ avg: string | null }>();

    const avgDurationSeconds =
      avgResult?.avg != null ? Math.round(parseFloat(avgResult.avg)) : null;

    const overdueThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const overdueRaw = await this.callTaskRepo
      .createQueryBuilder('ct')
      .select('ct.posteId', 'posteId')
      .addSelect('COUNT(*)', 'count')
      .where('ct.category = :category', { category })
      .andWhere('ct.status = :status', { status: CallTaskStatus.PENDING })
      .andWhere('ct.createdAt < :threshold', { threshold: overdueThreshold })
      .groupBy('ct.posteId')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany<{ posteId: string; count: string }>();

    const posteIds = overdueRaw.map((r) => r.posteId).filter(Boolean);
    const posteNameMap = await this.resolvePosteNames(posteIds);

    return {
      totalToday,
      totalPending,
      totalDone,
      avgDurationSeconds,
      topPostesOverdue: overdueRaw.map((r) => ({
        posteId:   r.posteId,
        posteName: posteNameMap.get(r.posteId) ?? null,
        count:     parseInt(r.count, 10),
      })),
    };
  }

  async list(params: CallTaskListParams): Promise<{ items: CallTaskRow[]; total: number }> {
    const qb = this.callTaskRepo
      .createQueryBuilder('ct')
      .leftJoin(CommercialObligationBatch, 'batch', 'batch.id = ct.batchId')
      .leftJoin(WhatsappPoste, 'poste', 'poste.id = ct.posteId')
      .where('ct.category = :category', { category: params.category });

    if (params.status) {
      qb.andWhere('ct.status = :status', { status: params.status });
    }
    if (params.posteId) {
      qb.andWhere('ct.posteId = :posteId', { posteId: params.posteId });
    }
    if (params.dateFrom) {
      qb.andWhere('ct.createdAt >= :dateFrom', { dateFrom: new Date(params.dateFrom) });
    }
    if (params.dateTo) {
      qb.andWhere('ct.createdAt <= :dateTo', { dateTo: new Date(params.dateTo) });
    }

    const total = await qb.getCount();

    const raw = await qb
      .select('ct.id', 'id')
      .addSelect('ct.category', 'category')
      .addSelect('ct.status', 'status')
      .addSelect('ct.clientPhone', 'clientPhone')
      .addSelect('ct.callEventId', 'callEventId')
      .addSelect('ct.durationSeconds', 'durationSeconds')
      .addSelect('ct.completedAt', 'completedAt')
      .addSelect('ct.createdAt', 'createdAt')
      .addSelect('ct.posteId', 'posteId')
      .addSelect('poste.name', 'posteName')
      .addSelect('COALESCE(batch.batchNumber, 0)', 'batchNumber')
      .orderBy('ct.createdAt', 'DESC')
      .offset((params.page - 1) * params.limit)
      .limit(params.limit)
      .getRawMany<Omit<CallTaskRow, 'commercialName'>>();

    // Résolution des noms de commerciaux par poste (batch)
    const posteIds = [...new Set(raw.map((r) => r.posteId).filter(Boolean))];
    const commercialNameMap = await this.resolveCommercialNamesByPoste(posteIds);

    const items: CallTaskRow[] = raw.map((r) => ({
      ...r,
      commercialName: commercialNameMap.get(r.posteId) ?? null,
    }));

    return { items, total };
  }

  // ── Helpers privés ───────────────────────────────────────────────────────

  private async resolvePosteNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const postes = await this.posteRepo.find({ where: { id: In(ids) }, select: ['id', 'name'] });
    return new Map(postes.map((p) => [p.id, p.name]));
  }

  private async resolveCommercialNamesByPoste(posteIds: string[]): Promise<Map<string, string>> {
    if (posteIds.length === 0) return new Map();

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[new Date().getDay()];
    const inClause = posteIds.map(() => '?').join(', ');

    // Groupe (poste) prime sur individuel, puis is_working_today
    const rows: Array<{ commercialName: string; posteId: string }> =
      await this.commercialRepo.manager.query(
        `SELECT c.name AS commercialName, p.id AS posteId
         FROM whatsapp_commercial c
         INNER JOIN whatsapp_poste p ON p.id = c.poste_id
         LEFT JOIN work_schedule ws_grp
           ON ws_grp.group_id = p.id
           AND ws_grp.day_of_week = ?
           AND ws_grp.is_active = 1
         LEFT JOIN work_schedule ws_ind
           ON ws_ind.commercial_id = c.id
           AND ws_ind.day_of_week = ?
           AND ws_ind.is_active = 1
         WHERE p.id IN (${inClause})
         ORDER BY
           CASE
             WHEN ws_grp.id IS NOT NULL THEN 2
             WHEN ws_ind.id IS NOT NULL THEN 1
             ELSE 0
           END DESC,
           c.is_working_today DESC`,
        [today, today, ...posteIds],
      );

    const map = new Map<string, string>();
    for (const row of rows) {
      if (!map.has(row.posteId)) {
        map.set(row.posteId, row.commercialName);
      }
    }
    return map;
  }
}
