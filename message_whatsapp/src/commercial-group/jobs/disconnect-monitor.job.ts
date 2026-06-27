import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ConnectionLog } from 'src/connection-log/entities/connection-log.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { SystemConfigService } from 'src/system-config/system-config.service';

export type DisconnectAlert = {
  commercialId: string;
  commercialName: string;
  disconnectedSince: string;
  totalDisconnectMinutes: number;
};

@Injectable()
export class DisconnectMonitorJob {
  private readonly logger = new Logger(DisconnectMonitorJob.name);

  constructor(
    @InjectRepository(ConnectionLog)
    private readonly connLogRepo: Repository<ConnectionLog>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
    private readonly systemConfig: SystemConfigService,
  ) {}

  @Interval(60_000)
  async run(): Promise<void> {
    try {
      const thresholdMinutes = parseInt(
        (await this.systemConfig.get('BREAK_DISCONNECT_ALERT_MINUTES')) ?? '15',
        10,
      );

      const cutoff = new Date(Date.now() - thresholdMinutes * 60_000);

      // Sessions encore ouvertes dont le login_at dépasse le seuil et pas encore alertées
      const staleLogs = await this.connLogRepo
        .createQueryBuilder('cl')
        .where('cl.user_type = :t', { t: 'commercial' })
        .andWhere('cl.logout_at IS NULL')
        .andWhere('cl.login_at < :cutoff', { cutoff })
        .andWhere('cl.alerted_at IS NULL')
        .getMany();

      if (staleLogs.length === 0) return;

      const commercialIds = [...new Set(staleLogs.map((l) => l.userId))];
      const commercials = await this.commercialRepo.find({
        where: commercialIds.map((id) => ({ id, deletedAt: IsNull() })),
        select: ['id', 'name'],
      });
      const nameMap = new Map(commercials.map((c) => [c.id, c.name]));

      for (const log of staleLogs) {
        const name = nameMap.get(log.userId) ?? log.userId;
        const disconnectedSince = log.loginAt.toISOString();
        const totalDisconnectMinutes = Math.floor(
          (Date.now() - log.loginAt.getTime()) / 60_000,
        );

        const alert: DisconnectAlert = {
          commercialId: log.userId,
          commercialName: name,
          disconnectedSince,
          totalDisconnectMinutes,
        };

        // Marquer pour éviter les doublons (visible via GET /commercial-groups/disconnect-alerts)
        await this.connLogRepo.update(log.id, { alertedAt: new Date() });
        this.logger.warn(
          `DisconnectAlert: commercial=${log.userId} (${name}) déconnecté depuis ${totalDisconnectMinutes} min`,
        );
      }
    } catch (err) {
      this.logger.error(`DisconnectMonitorJob error: ${String(err)}`);
    }
  }

  async getActiveAlerts(): Promise<DisconnectAlert[]> {
    const thresholdMinutes = parseInt(
      (await this.systemConfig.get('BREAK_DISCONNECT_ALERT_MINUTES')) ?? '15',
      10,
    );
    const cutoff = new Date(Date.now() - thresholdMinutes * 60_000);

    const staleLogs = await this.connLogRepo
      .createQueryBuilder('cl')
      .where('cl.user_type = :t', { t: 'commercial' })
      .andWhere('cl.logout_at IS NULL')
      .andWhere('cl.login_at < :cutoff', { cutoff })
      .getMany();

    if (staleLogs.length === 0) return [];

    const commercialIds = [...new Set(staleLogs.map((l) => l.userId))];
    const commercials = await this.commercialRepo.find({
      where: commercialIds.map((id) => ({ id, deletedAt: IsNull() })),
      select: ['id', 'name'],
    });
    const nameMap = new Map(commercials.map((c) => [c.id, c.name]));

    return staleLogs.map((log) => ({
      commercialId: log.userId,
      commercialName: nameMap.get(log.userId) ?? log.userId,
      disconnectedSince: log.loginAt.toISOString(),
      totalDisconnectMinutes: Math.floor((Date.now() - log.loginAt.getTime()) / 60_000),
    }));
  }
}
