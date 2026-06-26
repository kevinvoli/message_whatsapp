import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
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

      for (const commercial of commercials) {
        if (!commercial.subGroup?.isActive) continue;
        const schedules = commercial.subGroup.breakSchedules ?? [];
        for (const schedule of schedules) {
          await this.evaluateBreak(commercial, schedule, todayStr, nowHHmm);
        }
      }
    } catch (err) {
      this.logger.error(`BreakScheduleEngine error: ${String(err)}`);
    }
  }

  private async evaluateBreak(
    commercial: WhatsappCommercial,
    schedule: SubGroupBreakSchedule,
    todayStr: string,
    nowHHmm: string,
  ): Promise<void> {
    const start = schedule.startTime.slice(0, 5);
    const end = schedule.endTime.slice(0, 5);
    const inWindow = nowHHmm >= start && nowHHmm < end;
    const pastWindow = nowHHmm >= end;

    if (!inWindow && !pastWindow) return;

    const alreadyTaken = await this.sessionService.hasTakenBreak(commercial.id, schedule.id, todayStr);

    if (pastWindow) {
      if (!alreadyTaken) {
        await this.sessionService.markMissed(commercial.id, schedule.id, todayStr);
        this.gateway.server
          .to(`commercial:${commercial.id}`)
          .emit(BREAK_EVENTS.BREAK_PROMPT_CLEAR, { breakScheduleId: schedule.id, reason: 'expired' });
        this.lastPromptSentAt.delete(`${commercial.id}:${schedule.id}`);
      }
      return;
    }

    if (alreadyTaken) {
      this.lastPromptSentAt.delete(`${commercial.id}:${schedule.id}`);
      return;
    }

    const excluded = await this.exclusionService.isExcluded(
      commercial.id,
      commercial.poste?.id ?? '',
      schedule.subGroupId,
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

  private getCurrentHHmm(tz: string): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date()).slice(0, 5);
  }

  private buildExpiresAt(todayStr: string, endHHmm: string): string {
    return `${todayStr}T${endHHmm}:00.000Z`;
  }
}
