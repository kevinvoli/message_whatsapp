import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnectionLog } from 'src/connection-log/entities/connection-log.entity';
import { ConnectionLogService } from 'src/connection-log/connection-log.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CommercialPlanningService } from './commercial-planning.service';
import { GroupScheduleService } from './group-schedule.service';

export interface PresenceEntry {
  commercialId: string;
  commercialName: string;
  groupId: string | null;
  groupName: string | null;
  firstLoginAt: string | null;
  lastLogoutAt: string | null;
  sessionCount: number;
  totalConnectedMinutes: number;
  planningStatus: 'normal' | 'absent' | 'exceptional' | null;
  groupIsWorkDay: boolean | null;
  isWorkingToday: boolean;
}

export interface PresenceHistoryResponse {
  date: string;
  entries: PresenceEntry[];
}

interface RawSessionStat {
  userId: string;
  firstLogin: string | null;
  lastLogout: string | null;
  sessionCount: string;
}

@Injectable()
export class CommercialPresenceHistoryService {
  constructor(
    @InjectRepository(ConnectionLog)
    private readonly connLogRepo: Repository<ConnectionLog>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,

    private readonly planningService: CommercialPlanningService,
    private readonly groupScheduleService: GroupScheduleService,
    private readonly connectionLogService: ConnectionLogService,
  ) {}

  async getPresenceForDate(dateStr: string): Promise<PresenceHistoryResponse> {
    const dateStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dateEnd = new Date(`${dateStr}T23:59:59.999Z`);

    // 1. Tous les commerciaux actifs avec leur groupe — 1 requête
    const commercials = await this.commercialRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.group', 'group')
      .where('c.deletedAt IS NULL')
      .getMany();

    // 2. Stats de connexion du jour par commercial — batch unique GROUP BY
    const sessionStats = await this.connLogRepo
      .createQueryBuilder('log')
      .select('log.userId', 'userId')
      .addSelect('MIN(log.loginAt)', 'firstLogin')
      .addSelect('MAX(COALESCE(log.logoutAt, NOW()))', 'lastLogout')
      .addSelect('COUNT(*)', 'sessionCount')
      .where('log.userType = :userType', { userType: 'commercial' })
      .andWhere('log.loginAt >= :dateStart', { dateStart })
      .andWhere('log.loginAt <= :dateEnd', { dateEnd })
      .groupBy('log.userId')
      .getRawMany<RawSessionStat>();

    const statsMap = new Map<string, RawSessionStat>(
      sessionStats.map((s): [string, RawSessionStat] => [s.userId, s]),
    );

    // 3. Planning du jour — 1 requête
    const planningEntries = await this.planningService.findByDate(dateStr);
    const planningMap = new Map<string, 'absence' | 'exceptional'>(
      planningEntries.map((p): [string, 'absence' | 'exceptional'] => [p.commercialId, p.type]),
    );

    // 4. Groupes en jour travail pour la date — 1 requête
    const workDayGroupIds = new Set(
      await this.groupScheduleService.getWorkingGroupIdsForDate(dateStr),
    );

    // 5. Total minutes connecté par commercial — batch unique
    const commercialIds = commercials.map((c) => c.id);
    const minutesMap =
      commercialIds.length > 0
        ? await this.connectionLogService.getBulkConnectionMinutes(
            commercialIds,
            'commercial',
            dateStart,
            dateEnd,
          )
        : new Map<string, number>();

    // 6. Assemblage
    const entries: PresenceEntry[] = commercials.map((c) => {
      const stats = statsMap.get(c.id);
      const planningType = planningMap.get(c.id);
      const groupId = c.groupId;

      let planningStatus: 'normal' | 'absent' | 'exceptional' | null = null;
      if (planningType === 'absence') {
        planningStatus = 'absent';
      } else if (planningType === 'exceptional') {
        planningStatus = 'exceptional';
      } else if (groupId && workDayGroupIds.has(groupId)) {
        planningStatus = 'normal';
      }

      const groupIsWorkDay: boolean | null = groupId ? workDayGroupIds.has(groupId) : null;

      return {
        commercialId: c.id,
        commercialName: c.name,
        groupId: groupId ?? null,
        groupName: c.group?.name ?? null,
        firstLoginAt: stats?.firstLogin ? new Date(stats.firstLogin).toISOString() : null,
        lastLogoutAt: stats?.lastLogout ? new Date(stats.lastLogout).toISOString() : null,
        sessionCount: stats ? parseInt(stats.sessionCount, 10) : 0,
        totalConnectedMinutes: minutesMap.get(c.id) ?? 0,
        planningStatus,
        groupIsWorkDay,
        isWorkingToday: c.isWorkingToday,
      };
    });

    return { date: dateStr, entries };
  }
}
