import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DispatchSettings } from '../entities/dispatch-settings.entity';
import { DispatchSettingsAudit } from '../entities/dispatch-settings-audit.entity';
import { CronConfigService } from 'src/jorbs/cron-config.service';

const DEFAULTS = {
  no_reply_reinject_interval_minutes: 5,
  read_only_check_interval_minutes: 10,
  offline_reinject_cron: '0 9 * * *',
};

@Injectable()
export class DispatchSettingsService implements OnModuleInit {
  private readonly logger = new Logger(DispatchSettingsService.name);

  constructor(
    @InjectRepository(DispatchSettings)
    private readonly settingsRepository: Repository<DispatchSettings>,
    @InjectRepository(DispatchSettingsAudit)
    private readonly auditRepository: Repository<DispatchSettingsAudit>,
    private readonly cronConfigService: CronConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaults();
  }

  async getSettings(): Promise<DispatchSettings> {
    const existing = await this.settingsRepository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (existing) {
      return existing;
    }
    return this.ensureDefaults();
  }

  async updateSettings(
    patch: Partial<DispatchSettings>,
  ): Promise<DispatchSettings> {
    const settings = await this.getSettings();
    const before = { ...settings };

    if (patch.offline_reinject_cron) {
      this.assertValidCron(patch.offline_reinject_cron);
    }

    Object.assign(settings, patch);
    const saved = await this.settingsRepository.save(settings);
    await this.auditRepository.save(
      this.auditRepository.create({
        settings_id: saved.id,
        payload: JSON.stringify({
          before,
          after: saved,
          changed_at: new Date().toISOString(),
        }),
      }),
    );
    await this.cronConfigService.syncFromDispatchSettings(patch);
    return saved;
  }

  async resetDefaults(): Promise<DispatchSettings> {
    const settings = await this.getSettings();
    const before = { ...settings };
    Object.assign(settings, DEFAULTS);
    const saved = await this.settingsRepository.save(settings);
    await this.auditRepository.save(
      this.auditRepository.create({
        settings_id: saved.id,
        payload: JSON.stringify({
          before,
          after: saved,
          changed_at: new Date().toISOString(),
          reset: true,
        }),
      }),
    );
    await this.cronConfigService.syncFromDispatchSettings(DEFAULTS);
    return saved;
  }

  async getAudit(
    limit = 20,
    offset = 0,
    resetOnly = false,
    search?: string,
    from?: string,
    to?: string,
  ): Promise<DispatchSettingsAudit[]> {
    const take = Math.max(1, Math.min(200, limit));
    const skip = Math.max(0, offset);
    const qb = this.auditRepository
      .createQueryBuilder('audit')
      .orderBy('audit.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (resetOnly) {
      qb.andWhere('audit.payload LIKE :resetNeedle', {
        resetNeedle: '%"reset":true%',
      });
    }

    if (search) {
      qb.andWhere('audit.payload LIKE :search', {
        search: `%${search}%`,
      });
    }
    if (from) {
      qb.andWhere('audit.createdAt >= :from', { from });
    }
    if (to) {
      qb.andWhere('audit.createdAt <= :to', { to });
    }

    return qb.getMany();
  }

  async getAuditPage(
    page = 1,
    limit = 20,
    resetOnly = false,
    search?: string,
    from?: string,
    to?: string,
  ): Promise<{ data: DispatchSettingsAudit[]; total: number }> {
    const take = Math.max(1, Math.min(200, limit));
    const pageIndex = Math.max(1, page);
    const skip = (pageIndex - 1) * take;

    const qb = this.auditRepository
      .createQueryBuilder('audit')
      .orderBy('audit.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (resetOnly) {
      qb.andWhere('audit.payload LIKE :resetNeedle', {
        resetNeedle: '%"reset":true%',
      });
    }

    if (search) {
      qb.andWhere('audit.payload LIKE :search', {
        search: `%${search}%`,
      });
    }
    if (from) {
      qb.andWhere('audit.createdAt >= :from', { from });
    }
    if (to) {
      qb.andWhere('audit.createdAt <= :to', { to });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  private async ensureDefaults(): Promise<DispatchSettings> {
    const existing = await this.settingsRepository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (existing) return existing;

    const created = this.settingsRepository.create(DEFAULTS);
    return this.settingsRepository.save(created);
  }

  private assertValidCron(expression: string): void {
    try {
      const { CronJob } = require('cron');
      new CronJob(expression.trim(), () => undefined);
    } catch {
      throw new Error(`Invalid cron expression: ${expression}`);
    }
  }
}
