import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, Not, IsNull, Between } from 'typeorm';
import { CommercialGroup } from './entities/commercial-group.entity';
import { GroupScheduleDay } from './entities/group-schedule-day.entity';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { getTodayLocalString } from './utils/local-date.util';

@Injectable()
export class GroupScheduleService {
  constructor(
    @InjectRepository(CommercialGroup)
    private readonly groupRepo: Repository<CommercialGroup>,
    @InjectRepository(GroupScheduleDay)
    private readonly scheduleDayRepo: Repository<GroupScheduleDay>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  async generateForGroup(groupId: string, months = 3): Promise<number> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group || !group.firstWorkDay) {
      throw new NotFoundException('Groupe ' + groupId + ' introuvable ou firstWorkDay non défini');
    }

    const tz = (await this.systemConfigService.get('APP_TIMEZONE')) ?? 'Africa/Abidjan';
    const todayLocalStr = getTodayLocalString(tz);
    const startDate = new Date(todayLocalStr + 'T00:00:00Z');
    const endDate = new Date(startDate);
    endDate.setUTCMonth(endDate.getUTCMonth() + months);

    const firstWorkDayMidnight = new Date(group.firstWorkDay + 'T12:00:00Z');
    const cycleLength = group.workDaysCount * 2;
    const days: { groupId: string; date: string; isWorkDay: boolean }[] = [];

    const j = new Date(startDate);
    while (j <= endDate) {
      const jMidnight = new Date(new Intl.DateTimeFormat('fr-CA', { timeZone: tz }).format(j) + 'T12:00:00Z');
      const delta = Math.floor((jMidnight.getTime() - firstWorkDayMidnight.getTime()) / 86400000);
      const position = ((delta % cycleLength) + cycleLength) % cycleLength;
      const isWorkDay = position < group.workDaysCount;
      const dateStr = new Intl.DateTimeFormat('fr-CA', { timeZone: tz }).format(j);
      days.push({ groupId, date: dateStr, isWorkDay });
      j.setUTCDate(j.getUTCDate() + 1);
    }

    if (days.length === 0) return 0;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      const placeholders = days.map(() => '(UUID(), ?, ?, ?, NOW())').join(', ');
      const values: (string | boolean)[] = [];
      for (const d of days) {
        values.push(d.groupId, d.date, d.isWorkDay);
      }
      await queryRunner.query(
        'INSERT INTO group_schedule_day (id, group_id, date, is_work_day, created_at) VALUES ' + placeholders + ' ON DUPLICATE KEY UPDATE is_work_day = VALUES(is_work_day)',
        values,
      );
    } finally {
      await queryRunner.release();
    }

    return days.length;
  }

  async generateForAllGroups(months = 3): Promise<{ groupId: string; daysGenerated: number }[]> {
    const groups = await this.groupRepo.find({
      where: { isActive: true, firstWorkDay: Not(IsNull()) },
    });

    const results: { groupId: string; daysGenerated: number }[] = [];
    for (const group of groups) {
      try {
        const daysGenerated = await this.generateForGroup(group.id, months);
        results.push({ groupId: group.id, daysGenerated });
      } catch {
        results.push({ groupId: group.id, daysGenerated: 0 });
      }
    }
    return results;
  }

  async getTodayWorkingGroupIds(): Promise<string[]> {
    const tz = (await this.systemConfigService.get('APP_TIMEZONE')) ?? 'Africa/Abidjan';
    const todayStr = getTodayLocalString(tz);
    const rows = await this.scheduleDayRepo.find({
      where: { date: todayStr, isWorkDay: true },
      select: ['groupId'],
    });
    return rows.map((r) => r.groupId);
  }

  async getGroupsWithExpiringCalendar(
    withinDays = 7,
  ): Promise<{ groupId: string; groupName: string; lastDay: string | null }[]> {
    const tz = (await this.systemConfigService.get('APP_TIMEZONE')) ?? 'Africa/Abidjan';
    const todayStr = getTodayLocalString(tz);
    const horizonDate = new Date(todayStr + 'T00:00:00Z');
    horizonDate.setUTCDate(horizonDate.getUTCDate() + withinDays);
    const horizonStr = horizonDate.toISOString().slice(0, 10);

    const rows: { groupId: string; groupName: string; lastDay: string | null }[] =
      await this.dataSource.query(
        `SELECT g.id AS groupId, g.name AS groupName, MAX(d.date) AS lastDay
         FROM commercial_group g
         LEFT JOIN group_schedule_day d ON d.group_id = g.id
         WHERE g.is_active = 1
         GROUP BY g.id, g.name
         HAVING lastDay IS NULL OR lastDay <= ?`,
        [horizonStr],
      );
    return rows;
  }

  async getCalendarForGroup(
    groupId: string,
    from: string,
    to: string,
  ): Promise<{ date: string; isWorkDay: boolean; dayOfWeek: number }[]> {
    const rows = await this.scheduleDayRepo.find({
      where: { groupId, date: Between(from, to) },
      order: { date: 'ASC' },
    });
    return rows.map((r) => ({
      date: r.date,
      isWorkDay: r.isWorkDay,
      dayOfWeek: new Date(r.date + 'T00:00:00Z').getUTCDay(),
    }));
  }
}
