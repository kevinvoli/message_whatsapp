import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { BreakSession } from './entities/break-session.entity';
import { ConnectionLog } from 'src/connection-log/entities/connection-log.entity';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { getTodayLocalString } from './utils/local-date.util';
import { SystemConfigService } from 'src/system-config/system-config.service';

export type BreakSupervisionRow = {
  commercialId: string;
  commercialName: string;
  subGroupId: string | null;
  subGroupName: string | null;
  scheduledBreak: { startTime: string; endTime: string } | null;
  hasTakenBreak: boolean;
  breakTakenAt: string | null;
  disconnectDurationMinutes: number | null;
  status: 'en_service' | 'en_pause' | 'pause_manquee' | 'deconnecte' | 'repos' | 'absent';
};

@Injectable()
export class BreakSupervisionService {
  constructor(
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
    @InjectRepository(BreakSession)
    private readonly sessionRepo: Repository<BreakSession>,
    @InjectRepository(ConnectionLog)
    private readonly connLogRepo: Repository<ConnectionLog>,
    private readonly gateway: WhatsappMessageGateway,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async getSupervision(): Promise<BreakSupervisionRow[]> {
    const tz = (await this.systemConfig.get('APP_TIMEZONE')) ?? 'Africa/Abidjan';
    const todayStr = getTodayLocalString(tz);
    const nowHHmm = this.getCurrentHHmm(tz);
    const connectedIds = new Set(this.gateway.getConnectedCommercialIds());

    const commercials = await this.commercialRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.subGroup', 'sg', 'sg.is_active = 1 AND sg.deleted_at IS NULL')
      .leftJoinAndSelect('sg.breakSchedules', 'bs', 'bs.deleted_at IS NULL')
      .where('c.deleted_at IS NULL')
      .orderBy('c.name', 'ASC')
      .getMany();

    if (commercials.length === 0) return [];

    const commercialIds = commercials.map((c) => c.id);

    // Chargement groupé des sessions du jour
    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .where('s.commercial_id IN (:...ids)', { ids: commercialIds })
      .andWhere('s.date = :date', { date: todayStr })
      .getMany();
    const sessionMap = new Map<string, BreakSession>();
    for (const s of sessions) sessionMap.set(s.commercialId, s);

    // Chargement groupé des connexions ouvertes (logout_at IS NULL)
    const openLogs = await this.connLogRepo
      .createQueryBuilder('cl')
      .where('cl.user_id IN (:...ids)', { ids: commercialIds })
      .andWhere('cl.user_type = :t', { t: 'commercial' })
      .andWhere('cl.logout_at IS NULL')
      .getMany();
    const openLogMap = new Map<string, ConnectionLog>();
    for (const l of openLogs) openLogMap.set(l.userId, l);

    return commercials.map((c) => {
      const sg = c.subGroup ?? null;
      const schedules = sg?.breakSchedules ?? [];
      const activeSchedule = schedules.find((bs) => {
        const start = bs.startTime.slice(0, 5);
        const end = bs.endTime.slice(0, 5);
        return nowHHmm >= start && nowHHmm < end;
      }) ?? schedules[0] ?? null;

      const session = sessionMap.get(c.id) ?? null;
      const openLog = openLogMap.get(c.id) ?? null;
      const isConnected = connectedIds.has(c.id);

      // Durée de déconnexion en cours
      let disconnectDurationMinutes: number | null = null;
      if (!isConnected && openLog) {
        disconnectDurationMinutes = Math.floor(
          (Date.now() - openLog.loginAt.getTime()) / 60_000,
        );
      }

      const status = this.resolveStatus({
        isConnected,
        session,
        activeSchedule,
        nowHHmm,
        disconnectDurationMinutes,
      });

      return {
        commercialId: c.id,
        commercialName: c.name,
        subGroupId: sg?.id ?? null,
        subGroupName: sg?.name ?? null,
        scheduledBreak: activeSchedule
          ? { startTime: activeSchedule.startTime.slice(0, 5), endTime: activeSchedule.endTime.slice(0, 5) }
          : null,
        hasTakenBreak: session?.status === 'taken',
        breakTakenAt: session?.takenAt?.toISOString() ?? null,
        disconnectDurationMinutes,
        status,
      };
    });
  }

  private resolveStatus(ctx: {
    isConnected: boolean;
    session: BreakSession | null;
    activeSchedule: { startTime: string; endTime: string } | null;
    nowHHmm: string;
    disconnectDurationMinutes: number | null;
  }): BreakSupervisionRow['status'] {
    const { isConnected, session, activeSchedule, nowHHmm, disconnectDurationMinutes } = ctx;

    if (!isConnected && disconnectDurationMinutes !== null) return 'deconnecte';
    if (session?.status === 'taken') return 'en_pause';
    if (session?.status === 'missed') return 'pause_manquee';

    if (activeSchedule) {
      const end = activeSchedule.endTime.slice(0, 5);
      if (nowHHmm >= end && !session) return 'pause_manquee';
    }

    if (!isConnected) return 'repos';
    return 'en_service';
  }

  private getCurrentHHmm(tz: string): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date()).slice(0, 5);
  }
}
