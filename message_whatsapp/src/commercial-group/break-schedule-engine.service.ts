import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CommercialPlanning } from './entities/commercial-planning.entity';
import { GroupScheduleDay } from './entities/group-schedule-day.entity';
import { BreakExclusion } from './entities/break-exclusion.entity';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { BREAK_EVENTS } from 'src/realtime/events/socket-events.constants';
import { BreakExclusionService } from './break-exclusion.service';
import { BreakSessionService } from './break-session.service';
import { SubGroupBreakSchedule } from './entities/sub-group-break-schedule.entity';
import { getTodayLocalString } from './utils/local-date.util';

type PromptKey = string; // `${commercialId}:${breakScheduleId}`

@Injectable()
export class BreakScheduleEngine {
  private readonly logger = new Logger(BreakScheduleEngine.name);
  private readonly lastPromptSentAt = new Map<PromptKey, number>();

  constructor(
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
    @InjectRepository(CommercialPlanning)
    private readonly planningRepo: Repository<CommercialPlanning>,
    @InjectRepository(GroupScheduleDay)
    private readonly scheduleDayRepo: Repository<GroupScheduleDay>,
    private readonly systemConfig: SystemConfigService,
    private readonly gateway: WhatsappMessageGateway,
    private readonly exclusionService: BreakExclusionService,
    private readonly sessionService: BreakSessionService,
  ) {}

  @Interval(30_000)
  async run(): Promise<void> {
    try {
      const connectedIds = this.gateway.getConnectedCommercialIds();
      if (connectedIds.length === 0) return;

      const tz = (await this.systemConfig.get('APP_TIMEZONE')) ?? 'Africa/Abidjan';
      const todayStr = getTodayLocalString(tz);
      const nowHHmm = this.getCurrentHHmm(tz);

      const commercials = await this.commercialRepo
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.poste', 'poste')
        .leftJoinAndSelect('c.subGroup', 'sg', 'sg.is_active = 1 AND sg.deleted_at IS NULL')
        .leftJoinAndSelect('sg.breakSchedules', 'bs', 'bs.deleted_at IS NULL')
        .where('c.id IN (:...ids)', { ids: connectedIds })
        .andWhere('c.deleted_at IS NULL')
        .getMany();

      if (commercials.length === 0) return;

      // ── Préchargements groupés ────────────────────────────────────────────

      // Absences du jour (timeSlot sélectionné explicitement)
      const absences = await this.planningRepo
        .createQueryBuilder('p')
        .select(['p.commercialId', 'p.timeSlot'])
        .where('p.commercial_id IN (:...ids)', { ids: connectedIds })
        .andWhere('p.date = :date', { date: todayStr })
        .andWhere('p.type = :t', { t: 'absence' })
        .getMany();
      const absenceMap = new Map<string, 'full' | 'morning' | 'afternoon'>();
      for (const a of absences) absenceMap.set(a.commercialId, a.timeSlot);

      // Jours travaillés pour les groupes parents
      const groupIds = [...new Set(
        commercials.map((c) => c.subGroup?.parentGroupId).filter((id): id is string => !!id),
      )];
      const workDayMap = new Map<string, boolean>();
      if (groupIds.length > 0) {
        const days = await this.scheduleDayRepo
          .createQueryBuilder('d')
          .select(['d.groupId', 'd.isWorkDay'])
          .where('d.group_id IN (:...ids)', { ids: groupIds })
          .andWhere('d.date = :date', { date: todayStr })
          .getMany();
        for (const d of days) workDayMap.set(d.groupId, d.isWorkDay);
      }

      // Sessions prises aujourd'hui — une seule requête pour tous les pairs
      const allPairs: Array<{ commercialId: string; breakScheduleId: string }> = [];
      const allSubGroupIds: string[] = [];
      for (const commercial of commercials) {
        const sg = commercial.subGroup;
        if (!sg?.isActive) continue;
        for (const schedule of sg.breakSchedules ?? []) {
          allPairs.push({ commercialId: commercial.id, breakScheduleId: schedule.id });
        }
        allSubGroupIds.push(sg.id);
      }
      const takenSet = await this.sessionService.bulkHasTaken(allPairs, todayStr);

      // Exclusions — une seule requête pour tous les sous-groupes
      const uniqueSubGroupIds = [...new Set(allSubGroupIds)];
      const allExclusions = await this.exclusionService.findBySubGroups(uniqueSubGroupIds);
      const exclusionsBySubGroup = new Map<string, BreakExclusion[]>();
      for (const ex of allExclusions) {
        const list = exclusionsBySubGroup.get(ex.subGroupId) ?? [];
        list.push(ex);
        exclusionsBySubGroup.set(ex.subGroupId, list);
      }

      // ── Évaluation ────────────────────────────────────────────────────────

      for (const commercial of commercials) {
        if (!commercial.subGroup?.isActive) continue;
        const schedules = commercial.subGroup.breakSchedules ?? [];
        if (schedules.length === 0) continue;

        const parentGroupId = commercial.subGroup.parentGroupId;
        if (workDayMap.get(parentGroupId) === false) continue;

        const absenceSlot = absenceMap.get(commercial.id);

        for (const schedule of schedules) {
          if (absenceSlot === 'full') continue;
          if (absenceSlot === 'morning' && schedule.startTime.slice(0, 5) < '12:00') continue;
          if (absenceSlot === 'afternoon' && schedule.startTime.slice(0, 5) >= '12:00') continue;

          this.evaluateBreak(
            commercial,
            schedule,
            todayStr,
            nowHHmm,
            takenSet,
            exclusionsBySubGroup.get(commercial.subGroup.id) ?? [],
          );
        }
      }
    } catch (err) {
      this.logger.error(`BreakScheduleEngine error: ${String(err)}`);
    }
  }

  private evaluateBreak(
    commercial: WhatsappCommercial,
    schedule: SubGroupBreakSchedule,
    todayStr: string,
    nowHHmm: string,
    takenSet: Set<string>,
    exclusions: BreakExclusion[],
  ): void {
    const start = schedule.startTime.slice(0, 5);
    const end = schedule.endTime.slice(0, 5);
    const inWindow = nowHHmm >= start && nowHHmm < end;
    const pastWindow = nowHHmm >= end;

    if (!inWindow && !pastWindow) return;

    const taken = takenSet.has(`${commercial.id}:${schedule.id}`);

    if (pastWindow) {
      if (!taken) {
        void this.sessionService.markMissed(commercial.id, schedule.id, todayStr);
        this.gateway.server
          .to(`commercial:${commercial.id}`)
          .emit(BREAK_EVENTS.BREAK_PROMPT_CLEAR, { breakScheduleId: schedule.id, reason: 'expired' });
        this.lastPromptSentAt.delete(`${commercial.id}:${schedule.id}`);
      }
      return;
    }

    if (taken) {
      this.lastPromptSentAt.delete(`${commercial.id}:${schedule.id}`);
      return;
    }

    const excluded = exclusions.some(
      (e) =>
        (e.scope === 'commercial' && e.commercialId === commercial.id) ||
        (e.scope === 'poste' && e.posteId === (commercial.poste?.id ?? '')),
    );
    if (excluded) return;

    const key: PromptKey = `${commercial.id}:${schedule.id}`;
    const lastSent = this.lastPromptSentAt.get(key) ?? 0;
    if (Date.now() - lastSent < schedule.reminderIntervalMinutes * 60_000) return;

    this.gateway.server.to(`commercial:${commercial.id}`).emit(BREAK_EVENTS.BREAK_PROMPT, {
      breakScheduleId: schedule.id,
      subGroupName: commercial.subGroup?.name ?? '',
      endTime: end,
      messageText: schedule.popupMessageText,
      audioUrl: null,
      reminderIntervalMinutes: schedule.reminderIntervalMinutes,
      expiresAt: this.buildExpiresAt(todayStr, end),
    });

    this.lastPromptSentAt.set(key, Date.now());
    this.logger.debug(`BREAK_PROMPT → commercial:${commercial.id} schedule:${schedule.id}`);
  }

  getCurrentHHmm(tz: string): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date()).slice(0, 5);
  }

  buildExpiresAt(todayStr: string, endHHmm: string): string {
    return `${todayStr}T${endHHmm}:00.000Z`;
  }
}
