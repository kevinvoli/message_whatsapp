import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { WhapiChannel } from './entities/channel.entity';
import { SystemAlertService } from 'src/system-alert/system-alert.service';

type ChannelHealth = 'ok' | 'degraded' | 'disconnected';

/**
 * P4.4 — Vérification de santé des channels Meta toutes les heures.
 *
 * Interroge l'API Graph pour chaque channel Meta actif.
 * Si erreur 401/403 → alerte admin + flag dans l'entité.
 */
@Injectable()
export class ChannelHealthService {
  private readonly logger = new Logger(ChannelHealthService.name);
  private readonly META_API_VERSION = process.env.META_API_VERSION ?? 'v22.0';

  /** Cache in-process (channel_id → dernier statut + timestamp) */
  private readonly healthCache = new Map<
    string,
    { status: ChannelHealth; checkedAt: Date }
  >();

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,

    private readonly systemAlert: SystemAlertService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkAllMetaChannels(): Promise<void> {
    const channels = await this.channelRepo.find({
      where: { provider: 'meta' },
    });

    if (channels.length === 0) return;

    this.logger.log(`ChannelHealth: vérification de ${channels.length} channel(s) Meta`);

    for (const channel of channels) {
      try {
        await this.checkChannel(channel);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`ChannelHealth error channel=${channel.channel_id}: ${message}`);
      }
    }
  }

  async checkChannel(channel: WhapiChannel): Promise<ChannelHealth> {
    if (!channel.external_id || !channel.token) {
      this.setCache(channel.channel_id, 'degraded');
      return 'degraded';
    }

    const url = `https://graph.facebook.com/${this.META_API_VERSION}/${channel.external_id}`;

    try {
      await axios.get(url, {
        headers: { Authorization: `Bearer ${channel.token}` },
        timeout: 10_000,
      });

      this.setCache(channel.channel_id, 'ok');
      this.logger.debug(`ChannelHealth OK: ${channel.channel_id}`);
      return 'ok';
    } catch (err: any) {
      const statusCode: number | undefined = err?.response?.status;

      if (statusCode === 401 || statusCode === 403) {
        this.setCache(channel.channel_id, 'disconnected');
        await this.systemAlert.onSecurityEvent({
          source: 'channel_health_check',
          tenantId: channel.tenant_id ?? 'unknown',
          channelId: channel.channel_id,
          message: `Channel Meta déconnecté (HTTP ${statusCode}) — vérifier le token`,
          severity: 'high',
        });
        return 'disconnected';
      }

      this.setCache(channel.channel_id, 'degraded');
      return 'degraded';
    }
  }

  getHealth(channelId: string): { status: ChannelHealth; checkedAt: Date | null } {
    const cached = this.healthCache.get(channelId);
    return {
      status: cached?.status ?? 'ok',
      checkedAt: cached?.checkedAt ?? null,
    };
  }

  getAllHealthStatuses(): Array<{
    channelId: string;
    status: ChannelHealth;
    checkedAt: Date | null;
  }> {
    return [...this.healthCache.entries()].map(([channelId, data]) => ({
      channelId,
      status: data.status,
      checkedAt: data.checkedAt,
    }));
  }

  private setCache(channelId: string, status: ChannelHealth): void {
    this.healthCache.set(channelId, { status, checkedAt: new Date() });
  }
}
