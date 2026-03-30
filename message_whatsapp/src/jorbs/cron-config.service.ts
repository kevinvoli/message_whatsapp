import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CronConfig } from './entities/cron-config.entity';
import { UpdateCronConfigDto } from './dto/update-cron-config.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Valeurs par défaut par clé
// ─────────────────────────────────────────────────────────────────────────────
const CRON_DEFAULTS: Record<string, Partial<CronConfig>> = {
  'sla-checker': {
    label: 'Vérificateur SLA — réinjection premier message',
    description:
      'Vérifie toutes les N minutes si des chats ont dépassé leur deadline de première réponse et les réinjecte dans la queue.',
    enabled: true,
    scheduleType: 'interval',
    intervalMinutes: 5,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: null,
  },
  'read-only-enforcement': {
    label: 'Passage en lecture seule — inactivité 24h',
    description:
      "Passe en lecture seule les chats ACTIFS dont le client n'a pas écrit depuis plus de 24h.",
    enabled: true,
    scheduleType: 'interval',
    intervalMinutes: 10,
    cronExpression: null,
    ttlDays: 24,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: null,
  },
  'offline-reinject': {
    label: 'Réinjection des chats des agents hors ligne',
    description:
      "Réinjecte dans la queue les chats actifs assignés à des postes hors ligne qui n'ont reçu aucune réponse de l'agent.",
    enabled: true,
    scheduleType: 'cron',
    intervalMinutes: null,
    cronExpression: '0 9 * * *',
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: null,
  },
  'webhook-purge': {
    label: 'Purge des événements webhook anciens',
    description:
      "Supprime les entrées d'idempotency webhook plus vieilles que le TTL configuré.",
    enabled: true,
    scheduleType: 'cron',
    intervalMinutes: null,
    cronExpression: '0 3 * * *',
    ttlDays: 14,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: null,
  },
  'auto-message': {
    label: 'Messages automatiques',
    description:
      'Orchestrateur des messages automatiques envoyés après un délai configurable suite à un message entrant client.',
    enabled: false,
    scheduleType: 'event',
    intervalMinutes: null,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: 20,
    delayMaxSeconds: 45,
    maxSteps: 3,
  },
  'meta-token-refresh': {
    label: 'Refresh tokens Meta / Messenger / Instagram',
    description:
      'Renouvelle automatiquement les tokens Meta (WhatsApp Cloud, Messenger, Instagram) qui expirent dans moins de N jours (configurable).',
    enabled: true,
    scheduleType: 'cron',
    intervalMinutes: null,
    cronExpression: '0 3 * * *',
    ttlDays: 7,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: null,
  },
};

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class CronConfigService implements OnModuleInit {
  private readonly logger = new Logger(CronConfigService.name);

  /** Handlers enregistrés par les job services via registerHandler() */
  private readonly handlers = new Map<string, () => Promise<void>>();

  /** Preview handlers — retournent des infos sans exécuter d'action */
  private readonly previewHandlers = new Map<string, () => Promise<unknown>>();

  constructor(
    @InjectRepository(CronConfig)
    private readonly repo: Repository<CronConfig>,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaults();
    // Le scheduling initial est déclenché APRÈS l'enregistrement des handlers
    // (voir scheduleAll() appelé depuis le bootstrap ou par les job services)
    // Un délai est suffisant car NestJS initialise tous les providers avant
    // d'appeler onModuleInit sur les services qui dépendent de ceux-ci.
    // On schedule ici avec un setTimeout(0) pour laisser tous les registerHandler()
    // s'exécuter d'abord.
    setTimeout(() => {
      void this.scheduleAll().catch((err) =>
        this.logger.error('CronConfigService scheduleAll failed', err),
      );
    }, 0);
  }

  // ───────────────────────────── Registry pattern ──────────────────────────

  /**
   * Appelé par chaque job service dans son onModuleInit() pour s'enregistrer.
   * CronConfigService ne stocke aucune référence aux services de jobs.
   */
  registerHandler(key: string, fn: () => Promise<void>): void {
    this.handlers.set(key, fn);
    this.logger.log(`Handler registered for cron key="${key}"`);
  }

  registerPreviewHandler(key: string, fn: () => Promise<unknown>): void {
    this.previewHandlers.set(key, fn);
  }

  async preview(key: string): Promise<unknown> {
    const fn = this.previewHandlers.get(key);
    if (!fn) {
      return { available: false, message: 'Aucun aperçu disponible pour ce CRON.' };
    }
    return fn();
  }

  // ────────────────────────────── CRUD public ───────────────────────────────

  async findAll(): Promise<CronConfig[]> {
    return this.repo.find({ order: { key: 'ASC' } });
  }

  async findByKey(key: string): Promise<CronConfig> {
    const config = await this.repo.findOne({ where: { key } });
    if (!config) {
      throw new NotFoundException(`CRON config introuvable pour la clé "${key}"`);
    }
    return config;
  }

  async update(key: string, dto: UpdateCronConfigDto): Promise<CronConfig> {
    const config = await this.findByKey(key);

    // Validation expression cron
    if (dto.cronExpression !== undefined) {
      this.assertValidCron(dto.cronExpression);
    }

    // Validation croisée delay_min < delay_max pour auto-message
    if (key === 'auto-message') {
      const finalMin = dto.delayMinSeconds ?? config.delayMinSeconds ?? 1;
      const finalMax = dto.delayMaxSeconds ?? config.delayMaxSeconds ?? 2;
      if (finalMin >= finalMax) {
        throw new BadRequestException(
          `delayMinSeconds (${finalMin}) doit être inférieur à delayMaxSeconds (${finalMax})`,
        );
      }
    }

    if (dto.enabled !== undefined) config.enabled = dto.enabled;
    if (dto.intervalMinutes !== undefined) config.intervalMinutes = dto.intervalMinutes;
    if (dto.cronExpression !== undefined) config.cronExpression = dto.cronExpression;
    if (dto.ttlDays !== undefined) config.ttlDays = dto.ttlDays;
    if (dto.delayMinSeconds !== undefined) config.delayMinSeconds = dto.delayMinSeconds;
    if (dto.delayMaxSeconds !== undefined) config.delayMaxSeconds = dto.delayMaxSeconds;
    if (dto.maxSteps !== undefined) config.maxSteps = dto.maxSteps;

    const saved = await this.repo.save(config);
    this.scheduleOne(saved);
    return saved;
  }

  async reset(key: string): Promise<CronConfig> {
    const config = await this.findByKey(key);
    const defaults = CRON_DEFAULTS[key];
    if (!defaults) {
      throw new NotFoundException(`Pas de valeurs par défaut pour la clé "${key}"`);
    }
    Object.assign(config, defaults);
    const saved = await this.repo.save(config);
    this.scheduleOne(saved);
    return saved;
  }

  async runNow(key: string): Promise<{ ok: boolean; ranAt: string }> {
    const config = await this.findByKey(key);
    const handler = this.handlers.get(key);
    if (!handler) {
      throw new NotFoundException(`Aucun handler enregistré pour la clé "${key}"`);
    }
    this.logger.log(`Running cron "${key}" immediately`);
    await handler();
    await this.updateLastRunAt(config);
    return { ok: true, ranAt: new Date().toISOString() };
  }

  // ─────────────────────────── Scheduling public ───────────────────────────

  /** Peut être appelé après que tous les handlers sont enregistrés */
  async scheduleAll(): Promise<void> {
    const configs = await this.repo.find();
    for (const config of configs) {
      this.scheduleOne(config);
    }
  }

  // ─────────────────────────── Scheduling privé ────────────────────────────

  scheduleOne(config: CronConfig): void {
    this.stopSchedule(config.key);

    if (!config.enabled) {
      this.logger.log(`Cron "${config.key}" disabled — not scheduled`);
      return;
    }

    if (config.scheduleType === 'interval' && config.intervalMinutes) {
      const ms = Math.max(1, config.intervalMinutes) * 60 * 1000;
      const interval = setInterval(() => void this.runHandler(config.key), ms);
      this.schedulerRegistry.addInterval(config.key, interval);
      this.logger.log(`Cron "${config.key}" scheduled as interval every ${config.intervalMinutes} min`);
      return;
    }

    if (config.scheduleType === 'cron' && config.cronExpression) {
      const job = new CronJob(config.cronExpression, () => void this.runHandler(config.key));
      this.schedulerRegistry.addCronJob(config.key, job);
      job.start();
      this.logger.log(`Cron "${config.key}" scheduled as cron "${config.cronExpression}"`);
      return;
    }

    // schedule_type = 'event' → déclenché par l'orchestrateur, pas de scheduling
    this.logger.log(`Cron "${config.key}" is event-driven — no scheduling needed`);
  }

  private stopSchedule(key: string): void {
    if (this.schedulerRegistry.doesExist('interval', key)) {
      this.schedulerRegistry.deleteInterval(key);
    }
    if (this.schedulerRegistry.doesExist('cron', key)) {
      this.schedulerRegistry.deleteCronJob(key);
    }
  }

  private async runHandler(key: string): Promise<void> {
    const handler = this.handlers.get(key);
    if (!handler) {
      this.logger.warn(`No handler registered for cron key="${key}" — skipping`);
      return;
    }
    try {
      await handler();
      const config = await this.repo.findOne({ where: { key } });
      if (config) await this.updateLastRunAt(config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Cron "${key}" execution failed: ${msg}`, stack);
    }
  }

  private async updateLastRunAt(config: CronConfig): Promise<void> {
    await this.repo.update(config.id, { lastRunAt: new Date() });
  }

  // ─────────────────────────────── Bootstrap ───────────────────────────────

  private async ensureDefaults(): Promise<void> {
    for (const [key, defaults] of Object.entries(CRON_DEFAULTS)) {
      const existing = await this.repo.findOne({ where: { key } });
      if (!existing) {
        const created = this.repo.create({ key, ...defaults });
        await this.repo.save(created);
        this.logger.log(`Created default cron config for key="${key}"`);
      }
    }
  }

  // ──────────────────────────── Validation cron ────────────────────────────

  private assertValidCron(expression: string): void {
    const trimmed = expression.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      throw new BadRequestException(
        `Expression cron invalide (attendu 5 ou 6 champs) : "${expression}"`,
      );
    }
    try {
      new CronJob(trimmed, () => undefined);
    } catch {
      throw new BadRequestException(`Expression cron invalide : "${expression}"`);
    }
  }

  // ──────────────────── Rétro-compatibilité DispatchSettings ───────────────

  /**
   * Retourne les valeurs cron au format attendu par DispatchSettingsService.
   * Utilisé pour conserver la compatibilité de l'API GET /queue/dispatch/settings.
   */
  async getDispatchCompatSettings(): Promise<{
    no_reply_reinject_interval_minutes: number;
    read_only_check_interval_minutes: number;
    offline_reinject_cron: string;
    auto_message_enabled: boolean;
    auto_message_delay_min_seconds: number;
    auto_message_delay_max_seconds: number;
    auto_message_max_steps: number;
  }> {
    const configs = await this.repo.find();
    const byKey = Object.fromEntries(configs.map((c) => [c.key, c]));

    return {
      no_reply_reinject_interval_minutes:
        byKey['sla-checker']?.intervalMinutes ?? 5,
      read_only_check_interval_minutes:
        byKey['read-only-enforcement']?.intervalMinutes ?? 10,
      offline_reinject_cron:
        byKey['offline-reinject']?.cronExpression ?? '0 9 * * *',
      auto_message_enabled: byKey['auto-message']?.enabled ?? false,
      auto_message_delay_min_seconds: byKey['auto-message']?.delayMinSeconds ?? 20,
      auto_message_delay_max_seconds: byKey['auto-message']?.delayMaxSeconds ?? 45,
      auto_message_max_steps: byKey['auto-message']?.maxSteps ?? 3,
    };
  }

  /**
   * Sync les champs de dispatch_settings vers les lignes cron_config correspondantes.
   * Appelé par DispatchSettingsService.updateSettings() pour garder la cohérence.
   */
  async syncFromDispatchSettings(patch: {
    no_reply_reinject_interval_minutes?: number;
    read_only_check_interval_minutes?: number;
    offline_reinject_cron?: string;
    auto_message_enabled?: boolean;
    auto_message_delay_min_seconds?: number;
    auto_message_delay_max_seconds?: number;
    auto_message_max_steps?: number;
  }): Promise<void> {
    const updates: Array<{ key: string; dto: UpdateCronConfigDto }> = [];

    if (patch.no_reply_reinject_interval_minutes !== undefined) {
      updates.push({
        key: 'sla-checker',
        dto: { intervalMinutes: patch.no_reply_reinject_interval_minutes },
      });
    }
    if (patch.read_only_check_interval_minutes !== undefined) {
      updates.push({
        key: 'read-only-enforcement',
        dto: { intervalMinutes: patch.read_only_check_interval_minutes },
      });
    }
    if (patch.offline_reinject_cron !== undefined) {
      updates.push({
        key: 'offline-reinject',
        dto: { cronExpression: patch.offline_reinject_cron },
      });
    }
    if (
      patch.auto_message_enabled !== undefined ||
      patch.auto_message_delay_min_seconds !== undefined ||
      patch.auto_message_delay_max_seconds !== undefined ||
      patch.auto_message_max_steps !== undefined
    ) {
      const dto: UpdateCronConfigDto = {};
      if (patch.auto_message_enabled !== undefined) dto.enabled = patch.auto_message_enabled;
      if (patch.auto_message_delay_min_seconds !== undefined)
        dto.delayMinSeconds = patch.auto_message_delay_min_seconds;
      if (patch.auto_message_delay_max_seconds !== undefined)
        dto.delayMaxSeconds = patch.auto_message_delay_max_seconds;
      if (patch.auto_message_max_steps !== undefined)
        dto.maxSteps = patch.auto_message_max_steps;
      updates.push({ key: 'auto-message', dto });
    }

    for (const { key, dto } of updates) {
      try {
        await this.update(key, dto);
      } catch (err) {
        this.logger.warn(`syncFromDispatchSettings: failed to update "${key}": ${String(err)}`);
      }
    }
  }
}
