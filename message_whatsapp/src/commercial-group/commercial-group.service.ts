import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CommercialGroup } from './entities/commercial-group.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { GroupScheduleService } from './group-schedule.service';
import { ConnectionLog } from 'src/connection-log/entities/connection-log.entity';
import { ConnectionLogService } from 'src/connection-log/connection-log.service';

export interface DisconnectAlertItem {
  commercialId: string;
  commercialName: string;
  disconnectedSince: string;
  totalDisconnectMinutes: number;
}

export interface DisconnectHistoryEntry {
  logId: string;
  commercialId: string;
  commercialName: string;
  loginAt: string;
  logoutAt: string | null;
  alertedAt: string;
  durationMinutes: number;
  disconnectReason: string | null;
}

export interface DisconnectHistoryResponse {
  entries: DisconnectHistoryEntry[];
  total: number;
  page: number;
}

export interface SessionRow {
  id: string;
  commercialId: string;
  commercialName: string;
  loginAt: string;
  logoutAt: string | null;
  durationMinutes: number;
  status: 'active' | 'closed';
}

export interface SessionsResponse {
  sessions: SessionRow[];
  total: number;
  page: number;
  kpis: {
    activeSessions: number;
    avgDurationMinutes: number;
    totalConnectedMinutes: number;
  };
}

@Injectable()
export class CommercialGroupService {
  constructor(
    @InjectRepository(CommercialGroup)
    private readonly groupRepo: Repository<CommercialGroup>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,

    @InjectRepository(ConnectionLog)
    private readonly connLogRepo: Repository<ConnectionLog>,

    private readonly groupScheduleService: GroupScheduleService,
    private readonly connectionLogService: ConnectionLogService,
  ) {}

  async findAll(): Promise<CommercialGroup[]> {
    return this.groupRepo.find({
      relations: ['commercials', 'commercials.poste'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<CommercialGroup> {
    const group = await this.groupRepo.findOne({
      where: { id },
      relations: ['commercials'],
    });
    if (!group) throw new NotFoundException(`CommercialGroup ${id} not found`);
    return group;
  }

  async create(dto: { name: string; description?: string }): Promise<CommercialGroup> {
    return this.groupRepo.save(
      this.groupRepo.create({
        name: dto.name,
        description: dto.description ?? null,
        isActive: true,
      }),
    );
  }

  async update(
    id: string,
    dto: { name?: string; description?: string; isActive?: boolean },
  ): Promise<CommercialGroup> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) throw new NotFoundException(`CommercialGroup ${id} not found`);
    if (dto.name !== undefined) group.name = dto.name;
    if (dto.description !== undefined) group.description = dto.description ?? null;
    if (dto.isActive !== undefined) group.isActive = dto.isActive;
    return this.groupRepo.save(group);
  }

  async remove(id: string): Promise<void> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) throw new NotFoundException(`CommercialGroup ${id} not found`);

    // Retirer tous les membres avant désactivation
    await this.commercialRepo.update({ groupId: id }, { groupId: null });

    group.isActive = false;
    await this.groupRepo.save(group);
  }

  async addMember(groupId: string, commercialId: string): Promise<WhatsappCommercial> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`CommercialGroup ${groupId} not found`);
    const commercial = await this.commercialRepo.findOne({
      where: { id: commercialId, deletedAt: IsNull() },
      relations: ['poste'],
    });
    if (!commercial) throw new NotFoundException(`Commercial ${commercialId} not found`);

    if (commercial.poste) {
      const conflict = await this.commercialRepo.findOne({
        where: { groupId, poste: { id: commercial.poste.id }, deletedAt: IsNull() },
        relations: ['poste'],
      });
      if (conflict && conflict.id !== commercialId) {
        throw new ConflictException('Le groupe contient déjà un commercial sur le poste "' + commercial.poste.name + '"');
      }
    }

    commercial.groupId = groupId;
    return this.commercialRepo.save(commercial);
  }

  async removeMember(groupId: string, commercialId: string): Promise<WhatsappCommercial> {
    const commercial = await this.commercialRepo.findOne({
      where: { id: commercialId, groupId, deletedAt: IsNull() },
    });
    if (!commercial) throw new NotFoundException(`Commercial ${commercialId} not in group ${groupId}`);
    commercial.groupId = null;
    return this.commercialRepo.save(commercial);
  }

  async setScheduleConfig(id: string, dto: { workDaysCount: number; firstWorkDay: string }): Promise<CommercialGroup> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) throw new NotFoundException('CommercialGroup ' + id + ' not found');
    group.workDaysCount = dto.workDaysCount;
    group.firstWorkDay = dto.firstWorkDay;
    return this.groupRepo.save(group);
  }

  async generateSchedule(id: string, months?: number): Promise<number> {
    return this.groupScheduleService.generateForGroup(id, months);
  }

  async getSchedule(
    id: string,
    from?: string,
    to?: string,
  ): Promise<{ date: string; isWorkDay: boolean; dayOfWeek: number }[]> {
    const defaultFrom = new Date().toISOString().slice(0, 10);
    const defaultTo = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return this.groupScheduleService.getCalendarForGroup(id, from ?? defaultFrom, to ?? defaultTo);
  }

  async getSessions(opts: {
    date?: string;
    commercialId?: string;
    status?: 'active' | 'closed' | 'all';
    page?: number;
    limit?: number;
  }): Promise<SessionsResponse> {
    const tz = process.env['TZ'] ?? 'Africa/Abidjan';
    const dateStr = opts.date ?? new Intl.DateTimeFormat('fr-CA', { timeZone: tz }).format(new Date());
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.max(1, opts.limit ?? 50);
    const status = opts.status ?? 'all';

    const dateStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dateEnd = new Date(`${dateStr}T23:59:59.999Z`);

    const qb = this.connLogRepo
      .createQueryBuilder('log')
      .where('log.userType = :userType', { userType: 'commercial' })
      .andWhere('log.loginAt >= :dateStart', { dateStart })
      .andWhere('log.loginAt <= :dateEnd', { dateEnd })
      .orderBy('log.loginAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (opts.commercialId) {
      qb.andWhere('log.userId = :commercialId', { commercialId: opts.commercialId });
    }
    if (status === 'active') {
      qb.andWhere('log.logoutAt IS NULL');
    } else if (status === 'closed') {
      qb.andWhere('log.logoutAt IS NOT NULL');
    }

    const [logs, total] = await qb.getManyAndCount();

    const userIds = [...new Set(logs.map((l) => l.userId))];

    let nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const commercials = await this.commercialRepo
        .createQueryBuilder('c')
        .select(['c.id', 'c.name'])
        .where('c.id IN (:...ids)', { ids: userIds })
        .andWhere('c.deletedAt IS NULL')
        .getMany();
      nameMap = new Map(commercials.map((c) => [c.id, c.name]));
    }

    const now = Date.now();
    const sessions: SessionRow[] = logs.map((log) => {
      const durationMinutes = log.logoutAt
        ? Math.floor((log.logoutAt.getTime() - log.loginAt.getTime()) / 60000)
        : Math.floor((now - log.loginAt.getTime()) / 60000);
      return {
        id: log.id,
        commercialId: log.userId,
        commercialName: nameMap.get(log.userId) ?? log.userId,
        loginAt: log.loginAt.toISOString(),
        logoutAt: log.logoutAt?.toISOString() ?? null,
        durationMinutes,
        status: log.logoutAt ? 'closed' : 'active',
      };
    });

    const activeSessions = sessions.filter((s) => s.status === 'active').length;
    const closedSessions = sessions.filter((s) => s.status === 'closed');
    const avgDurationMinutes =
      closedSessions.length > 0
        ? Math.floor(
            closedSessions.reduce((sum, s) => sum + s.durationMinutes, 0) / closedSessions.length,
          )
        : 0;

    const minutesMap = await this.connectionLogService.getBulkConnectionMinutes(
      userIds,
      'commercial',
      dateStart,
      dateEnd,
    );
    const totalConnectedMinutes = [...minutesMap.values()].reduce((sum, m) => sum + m, 0);

    return {
      sessions,
      total,
      page,
      kpis: { activeSessions, avgDurationMinutes, totalConnectedMinutes },
    };
  }

  async getDisconnectHistory(opts: {
    from?: string;
    to?: string;
    commercialId?: string;
    page: number;
    limit: number;
  }): Promise<DisconnectHistoryResponse> {
    const qb = this.connLogRepo
      .createQueryBuilder('log')
      .where('log.alertedAt IS NOT NULL')
      .andWhere('log.userType = :userType', { userType: 'commercial' })
      .orderBy('log.alertedAt', 'DESC')
      .skip((opts.page - 1) * opts.limit)
      .take(opts.limit);

    if (opts.from) {
      const dateStart = new Date(`${opts.from}T00:00:00.000Z`);
      qb.andWhere('log.loginAt >= :dateStart', { dateStart });
    }
    if (opts.to) {
      const dateEnd = new Date(`${opts.to}T23:59:59.999Z`);
      qb.andWhere('log.loginAt <= :dateEnd', { dateEnd });
    }
    if (opts.commercialId) {
      qb.andWhere('log.userId = :commercialId', { commercialId: opts.commercialId });
    }

    const [logs, total] = await qb.getManyAndCount();

    const userIds = [...new Set(logs.map((l) => l.userId))];
    let nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const commercials = await this.commercialRepo
        .createQueryBuilder('c')
        .select(['c.id', 'c.name'])
        .where('c.id IN (:...ids)', { ids: userIds })
        .andWhere('c.deletedAt IS NULL')
        .getMany();
      nameMap = new Map(commercials.map((c) => [c.id, c.name]));
    }

    const now = Date.now();
    const entries: DisconnectHistoryEntry[] = logs.map((log) => {
      const durationMinutes = log.logoutAt
        ? Math.floor((log.logoutAt.getTime() - log.loginAt.getTime()) / 60000)
        : Math.floor((now - log.loginAt.getTime()) / 60000);
      return {
        logId: log.id,
        commercialId: log.userId,
        commercialName: nameMap.get(log.userId) ?? log.userId,
        loginAt: log.loginAt.toISOString(),
        logoutAt: log.logoutAt?.toISOString() ?? null,
        alertedAt: log.alertedAt!.toISOString(),
        durationMinutes,
        disconnectReason: log.disconnectReason,
      };
    });

    return { entries, total, page: opts.page };
  }

  async patchDisconnectReason(logId: string, reason: string): Promise<{ success: true }> {
    await this.connLogRepo.update({ id: logId }, { disconnectReason: reason });
    return { success: true };
  }

  async getActiveAlerts(): Promise<DisconnectAlertItem[]> {
    const logs = await this.connLogRepo
      .createQueryBuilder('log')
      .where('log.alertedAt IS NOT NULL')
      .andWhere('log.logoutAt IS NULL')
      .andWhere('log.userType = :userType', { userType: 'commercial' })
      .orderBy('log.alertedAt', 'ASC')
      .getMany();

    if (logs.length === 0) return [];

    const userIds = [...new Set(logs.map((l) => l.userId))];
    const commercials = await this.commercialRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.name'])
      .where('c.id IN (:...ids)', { ids: userIds })
      .andWhere('c.deletedAt IS NULL')
      .getMany();
    const nameMap = new Map(commercials.map((c) => [c.id, c.name]));

    const now = Date.now();
    return logs.map((log) => ({
      commercialId: log.userId,
      commercialName: nameMap.get(log.userId) ?? log.userId,
      disconnectedSince: log.loginAt.toISOString(),
      totalDisconnectMinutes: Math.floor((now - log.loginAt.getTime()) / 60_000),
    }));
  }
}
