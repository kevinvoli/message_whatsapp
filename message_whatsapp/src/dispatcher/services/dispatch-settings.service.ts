import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DispatchSettings } from '../entities/dispatch-settings.entity';
import { DispatchSettingsAudit } from '../entities/dispatch-settings-audit.entity';
import { OfflineReinjectionJob } from 'src/jorbs/offline-reinjection.job';
import { ReadOnlyEnforcementJob } from 'src/jorbs/read-only-enforcement.job';
import { FirstResponseTimeoutJob } from 'src/jorbs/first-response-timeout.job';

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
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly offlineJob: OfflineReinjectionJob,
    private readonly readOnlyJob: ReadOnlyEnforcementJob,
    private readonly firstResponseJob: FirstResponseTimeoutJob,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaults();
    await this.rescheduleAll();
  }

  async getSettings(): Promise<DispatchSettings> {
    const existing = await this.settingsRepository.findOne({
      where: {},
      order: { created_at: 'ASC' },
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
    await this.rescheduleAll();
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
    await this.rescheduleAll();
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
      .orderBy('audit.created_at', 'DESC')
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
      qb.andWhere('audit.created_at >= :from', { from });
    }
    if (to) {
      qb.andWhere('audit.created_at <= :to', { to });
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
      .orderBy('audit.created_at', 'DESC')
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
      qb.andWhere('audit.created_at >= :from', { from });
    }
    if (to) {
      qb.andWhere('audit.created_at <= :to', { to });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  private async ensureDefaults(): Promise<DispatchSettings> {
    const existing = await this.settingsRepository.findOne({
      where: {},
      order: { created_at: 'ASC' },
    });
    if (existing) return existing;

    const created = this.settingsRepository.create(DEFAULTS);
    return this.settingsRepository.save(created);
  }

  private async rescheduleAll(): Promise<void> {
    const settings = await this.getSettings();
    this.registerInterval(
      'read-only-enforcement',
      settings.read_only_check_interval_minutes,
      () => this.readOnlyJob.enforce24h(),
    );
    this.registerCron('offline-reinject', settings.offline_reinject_cron, () =>
      this.offlineJob.offlineReinject(),
    );
    await this.firstResponseJob.refreshSlaIntervals(
      settings.no_reply_reinject_interval_minutes,
    );
  }

  private registerInterval(
    name: string,
    minutes: number,
    handler: () => void | Promise<void>,
  ) {
    if (this.schedulerRegistry.doesExist('interval', name)) {
      this.schedulerRegistry.deleteInterval(name);
    }

    const ms = Math.max(1, minutes) * 60 * 1000;
    const interval = setInterval(() => void handler(), ms);
    this.schedulerRegistry.addInterval(name, interval);
    this.logger.log(`Dispatch interval ${name} set to ${minutes} min`);
  }

  private registerCron(
    name: string,
    cronExpression: string,
    handler: () => void | Promise<void>,
  ) {
    if (this.schedulerRegistry.doesExist('cron', name)) {
      this.schedulerRegistry.deleteCronJob(name);
    }

    const job = new CronJob(cronExpression, () => void handler());
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
    this.logger.log(`Dispatch cron ${name} set to ${cronExpression}`);
  }

  private assertValidCron(expression: string) {
    const trimmed = expression.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      throw new Error(
        `Invalid cron expression (expected 5 or 6 fields): ${expression}`,
      );
    }
    const hasSeconds = parts.length === 6;
    const ranges = hasSeconds
      ? [
          [0, 59],
          [0, 59],
          [0, 23],
          [1, 31],
          [1, 12],
          [0, 6],
        ]
      : [
          [0, 59],
          [0, 23],
          [1, 31],
          [1, 12],
          [0, 6],
        ];
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (!this.isCronPartValid(part, ranges[i][0], ranges[i][1])) {
        throw new Error(`Invalid cron field "${part}" in ${expression}`);
      }
    }

    try {
      // Will throw if expression invalid

      new CronJob(trimmed, () => undefined);
    } catch (error) {
      throw new Error(`Invalid cron expression: ${expression}`);
    }
  }

  private isCronPartValid(part: string, min: number, max: number): boolean {
    if (part === '*') return true;
    if (part.includes('/')) {
      const [base, step] = part.split('/');
      if (!step || Number.isNaN(Number(step))) return false;
      return this.isCronPartValid(base, min, max);
    }
    if (part.includes(',')) {
      return part
        .split(',')
        .every((chunk) => this.isCronPartValid(chunk, min, max));
    }
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (Number.isNaN(start) || Number.isNaN(end)) return false;
      return start >= min && end <= max && start <= end;
    }
    const value = Number(part);
    return !Number.isNaN(value) && value >= min && value <= max;
  }
}
