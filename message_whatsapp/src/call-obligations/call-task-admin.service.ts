import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, Repository } from 'typeorm';
import { CallTask, CallTaskCategory, CallTaskStatus } from './entities/call-task.entity';
import { CommercialObligationBatch } from './entities/commercial-obligation-batch.entity';

export interface CallTaskMetrics {
  totalToday: number;
  totalPending: number;
  totalDone: number;
  avgDurationSeconds: number | null;
  topPostesOverdue: Array<{ posteId: string; count: number }>;
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

    return {
      totalToday,
      totalPending,
      totalDone,
      avgDurationSeconds,
      topPostesOverdue: overdueRaw.map((r) => ({
        posteId: r.posteId,
        count: parseInt(r.count, 10),
      })),
    };
  }

  async list(params: CallTaskListParams): Promise<{ items: CallTaskRow[]; total: number }> {
    const qb = this.callTaskRepo
      .createQueryBuilder('ct')
      .leftJoin(CommercialObligationBatch, 'batch', 'batch.id = ct.batchId')
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
      .addSelect('COALESCE(batch.batchNumber, 0)', 'batchNumber')
      .orderBy('ct.createdAt', 'DESC')
      .offset((params.page - 1) * params.limit)
      .limit(params.limit)
      .getRawMany<CallTaskRow>();

    return { items: raw, total };
  }
}
