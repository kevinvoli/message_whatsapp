import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CronConfig } from './entities/cron-config.entity';
import { UpdateCronConfigDto } from './dto/update-cron-config.dto';
import { NotificationService } from 'src/notification/notification.service';

// ─────────────────────────────────────────────────────────────────────────────
// Valeurs par défaut par clé
// ─────────────────────────────────────────────────────────────────────────────
const CRON_DEFAULTS: Record<string, Partial<CronConfig>> = {
  'sla-checker': {
    label: 'Vérificateur SLA — réinjection conversations non lues',
    description:
      'Toutes les 30 min, récupère les conversations non lues depuis plus de 15 min (seuil configurable) et rééquilibre la charge entre postes par batch de 300 (maxSteps). Désactivé automatiquement entre 21h et 5h.',
    enabled: true,
    scheduleType: 'interval',
    intervalMinutes: 30,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: 300,
    noResponseThresholdMinutes: 15,
  },
  'read-only-enforcement': {
    label: 'Fermeture automatique — sans réponse commerciale',
    description:
      "Ferme automatiquement les conversations non fermées dont le commercial n'a pas répondu depuis plus de N heures (ttlDays = nombre d'heures).",
    enabled: true,
    scheduleType: 'interval',
    intervalMinutes: 60,
    cronExpression: null,
    ttlDays: 24,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: null,
  },
  'offline-reinject': {
    label: 'Réinjection — agents hors ligne & conversations orphelines',
    description:
      "Réinjecte dans la queue (1) les chats actifs sur des postes hors ligne sans réponse, et (2) les conversations orphelines (poste_id = null) qui n'ont jamais été assignées.",
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
    label: 'Messages automatiques — Séquence',
    description:
      'Orchestrateur des messages automatiques de séquence envoyés après un délai configurable suite à un message entrant client.',
    enabled: false,
    scheduleType: 'event',
    intervalMinutes: null,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: 300,
    delayMaxSeconds: 540,
    maxSteps: 3,
    noResponseThresholdMinutes: null,
    queueWaitThresholdMinutes: null,
    inactivityThresholdMinutes: null,
    applyToReadOnly: null,
    applyToClosed: null,
    activeHourStart: null,
    activeHourEnd: null,
  },

  // ─── Job maître — seule clé réellement schedulée ─────────────────────────

  'auto-message-master': {
    label: 'Job maître — Messages automatiques',
    description:
      'Job unique qui vérifie séquentiellement tous les triggers de messages automatiques activés. ' +
      'Toutes les autres clés "auto-message-*" sont des entrées de configuration uniquement.',
    enabled: false,
    scheduleType: 'interval',
    intervalMinutes: 5,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: null,
    noResponseThresholdMinutes: null,
    queueWaitThresholdMinutes: null,
    inactivityThresholdMinutes: null,
    applyToReadOnly: null,
    applyToClosed: null,
    activeHourStart: 5,
    activeHourEnd: 21,
  },

  // ─── Clés config-only (scheduleType: 'config') ───────────────────────────

  'no-response-auto-message': {
    label: 'Config trigger — Sans réponse',
    description: "Envoie un message si le client attend depuis plus de X minutes sans réponse d'un agent.",
    enabled: false,
    scheduleType: 'config',
    intervalMinutes: null,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: 1,
    noResponseThresholdMinutes: 60,
    queueWaitThresholdMinutes: null,
    inactivityThresholdMinutes: null,
    applyToReadOnly: false,
    applyToClosed: false,
    activeHourStart: null,
    activeHourEnd: null,
  },
  'out-of-hours-auto-message': {
    label: 'Config trigger — Hors horaires',
    description: "Envoie un message quand le client contacte en dehors des horaires d'ouverture configurés.",
    enabled: false,
    scheduleType: 'config',
    intervalMinutes: null,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: 1,
    noResponseThresholdMinutes: null,
    queueWaitThresholdMinutes: null,
    inactivityThresholdMinutes: null,
    applyToReadOnly: null,
    applyToClosed: null,
    activeHourStart: null,
    activeHourEnd: null,
  },
  'reopened-auto-message': {
    label: 'Config trigger — Réouverture de conversation',
    description: "Envoie un message quand le client réécrit après qu'une conversation a été fermée.",
    enabled: false,
    scheduleType: 'config',
    intervalMinutes: null,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: 1,
    noResponseThresholdMinutes: null,
    queueWaitThresholdMinutes: null,
    inactivityThresholdMinutes: null,
    applyToReadOnly: null,
    applyToClosed: null,
    activeHourStart: null,
    activeHourEnd: null,
  },
  'queue-wait-auto-message': {
    label: 'Config trigger — Attente en queue',
    description: "Envoie un message si le client non assigné attend depuis plus de X minutes.",
    enabled: false,
    scheduleType: 'config',
    intervalMinutes: null,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: 1,
    noResponseThresholdMinutes: null,
    queueWaitThresholdMinutes: 30,
    inactivityThresholdMinutes: null,
    applyToReadOnly: null,
    applyToClosed: null,
    activeHourStart: null,
    activeHourEnd: null,
  },
  'keyword-auto-message': {
    label: 'Config trigger — Mot-clé détecté',
    description: "Envoie un message quand le client utilise un mot-clé ou une phrase configurée.",
    enabled: false,
    scheduleType: 'config',
    intervalMinutes: null,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: null,
    noResponseThresholdMinutes: null,
    queueWaitThresholdMinutes: null,
    inactivityThresholdMinutes: null,
    applyToReadOnly: null,
    applyToClosed: null,
    activeHourStart: null,
    activeHourEnd: null,
  },
  'client-type-auto-message': {
    label: 'Config trigger — Type de client',
    description: "Envoie un message différent selon que le client est nouveau ou connu.",
    enabled: false,
    scheduleType: 'config',
    intervalMinutes: null,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: null,
    noResponseThresholdMinutes: null,
    queueWaitThresholdMinutes: null,
    inactivityThresholdMinutes: null,
    applyToReadOnly: null,
    applyToClosed: null,
    activeHourStart: null,
    activeHourEnd: null,
  },
  'inactivity-auto-message': {
    label: 'Config trigger — Inactivité totale',
    description: "Envoie un message si aucune activité des deux côtés depuis plus de X minutes.",
    enabled: false,
    scheduleType: 'config',
    intervalMinutes: null,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: 1,
    noResponseThresholdMinutes: null,
    queueWaitThresholdMinutes: null,
    inactivityThresholdMinutes: 120,
    applyToReadOnly: false,
    applyToClosed: null,
    activeHourStart: null,
    activeHourEnd: null,
  },
  'on-assign-auto-message': {
    label: "Config trigger — Après assignation d'un agent",
    description: "Envoie un message automatiquement quand un agent commercial est assigné à la conversation.",
    enabled: false,
    scheduleType: 'config',
    intervalMinutes: null,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: null,
    noResponseThresholdMinutes: null,
    queueWaitThresholdMinutes: null,
    inactivityThresholdMinutes: null,
    applyToReadOnly: null,
    applyToClosed: null,
    activeHourStart: null,
    activeHourEnd: null,
  },
  'orphan-checker': {
    label: 'Rattrapage orphelins — conversations sans poste',
    description:
      'Dispatche toutes les 15 min les conversations sans poste (poste_id = NULL). Filet de sécurité si le dispatch initial a échoué. Désactivé automatiquement entre 21h et 5h.',
    enabled: true,
    scheduleType: 'interval',
    intervalMinutes: 15,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: null,
  },
  'disconnect-all': {
    label: 'Déconnexion automatique fin de journée',
    description:
      "Déconnecte tous les commerciaux connectés à une heure fixe chaque soir. " +
      "Modifiez l'expression cron pour changer l'heure (ex : \"0 21 * * *\" = chaque jour à 21h).",
    enabled: true,
    scheduleType: 'cron',
    intervalMinutes: null,
    cronExpression: '0 21 * * *',
    ttlDays: null,
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
  private readonly handlers = new Map<string, () => Promise<string | void>>();

  /** Preview handlers — retournent des infos sans exécuter d'action */
  private readonly previewHandlers = new Map<string, () => Promise<unknown>>();

  /** Rapport de la dernière exécution par clé (en mémoire) */
  private readonly lastRunReports = new Map<string, { report: string; ranAt: Date }>();

  constructor(
    @InjectRepository(CronConfig)
    private readonly repo: Repository<CronConfig>,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Optional() private readonly notificationService?: NotificationService,
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
  registerHandler(key: string, fn: () => Promise<string | void>): void {
    this.handlers.set(key, fn);
    this.logger.log(`Handler registered for cron key="${key}"`);
  }

  getLastRunReports(): Record<string, { report: string; ranAt: string }> {
    const result: Record<string, { report: string; ranAt: string }> = {};
    for (const [key, value] of this.lastRunReports.entries()) {
      result[key] = { report: value.report, ranAt: value.ranAt.toISOString() };
    }
    return result;
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

  async findByKeys(keys: string[]): Promise<Map<string, CronConfig>> {
    const configs = await this.repo.find({ where: keys.map((k) => ({ key: k })) });
    const map = new Map<string, CronConfig>();
    for (const c of configs) map.set(c.key, c);
    return map;
  }

  async update(key: string, dto: UpdateCronConfigDto): Promise<CronConfig> {
    const config = await this.findByKey(key);

    // Validation expression cron
    if (dto.cronExpression !== undefined) {
      this.assertValidCron(dto.cronExpression);
    }

    // Validation croisée plage horaire pour auto-message-master
    if (key === 'auto-message-master') {
      const finalStart = dto.activeHourStart ?? config.activeHourStart ?? 5;
      const finalEnd   = dto.activeHourEnd   ?? config.activeHourEnd   ?? 21;
      if (finalStart >= finalEnd) {
        throw new BadRequestException(
          `activeHourStart (${finalStart}) doit être inférieur à activeHourEnd (${finalEnd})`,
        );
      }
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

    if (dto.enabled !== undefined)            config.enabled            = dto.enabled;
    if (dto.intervalMinutes !== undefined)    config.intervalMinutes    = dto.intervalMinutes;
    if (dto.cronExpression !== undefined)     config.cronExpression     = dto.cronExpression;
    if (dto.ttlDays !== undefined)            config.ttlDays            = dto.ttlDays;
    if (dto.delayMinSeconds !== undefined)    config.delayMinSeconds    = dto.delayMinSeconds;
    if (dto.delayMaxSeconds !== undefined)    config.delayMaxSeconds    = dto.delayMaxSeconds;
    if (dto.maxSteps !== undefined)           config.maxSteps           = dto.maxSteps;

    // Nouveaux champs multi-triggers
    if (dto.noResponseThresholdMinutes !== undefined)  config.noResponseThresholdMinutes  = dto.noResponseThresholdMinutes;
    if (dto.queueWaitThresholdMinutes !== undefined)   config.queueWaitThresholdMinutes   = dto.queueWaitThresholdMinutes;
    if (dto.inactivityThresholdMinutes !== undefined)  config.inactivityThresholdMinutes  = dto.inactivityThresholdMinutes;
    if (dto.applyToReadOnly !== undefined)             config.applyToReadOnly             = dto.applyToReadOnly;
    if (dto.applyToClosed !== undefined)               config.applyToClosed               = dto.applyToClosed;
    if (dto.activeHourStart !== undefined)             config.activeHourStart             = dto.activeHourStart;
    if (dto.activeHourEnd !== undefined)               config.activeHourEnd               = dto.activeHourEnd;

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

    // schedule_type = 'config' → configuration pure, jamais schedulée
    if (config.scheduleType === 'config') {
      this.logger.log(`Cron "${config.key}" is config-only — no scheduling needed`);
      return;
    }

    // schedule_type = 'event' → déclenché par l'orchestrateur, pas de scheduling
    this.logger.log(`Cron "${config.key}" is event-driven — no scheduling needed`);
  }

  private stopSchedule(key: string): void {
    try {
      if (this.schedulerRegistry.doesExist('interval', key)) {
        this.schedulerRegistry.deleteInterval(key);
        this.logger.log(`Cron "${key}" interval stopped`);
      }
    } catch (err) {
      this.logger.warn(`Could not delete interval "${key}": ${String(err)}`);
    }
    try {
      if (this.schedulerRegistry.doesExist('cron', key)) {
        this.schedulerRegistry.deleteCronJob(key);
        this.logger.log(`Cron "${key}" cron job stopped`);
      }
    } catch (err) {
      this.logger.warn(`Could not delete cron job "${key}": ${String(err)}`);
    }
  }

  private async runHandler(key: string): Promise<void> {
    // Double-vérification en DB : si le cron a été désactivé pendant qu'une exécution
    // était en attente (ex: setInterval déjà schedulé), on l'ignore.
    const config = await this.repo.findOne({ where: { key } });
    if (!config?.enabled) {
      this.logger.warn(`Cron "${key}" is disabled in DB — skipping execution`);
      this.stopSchedule(key); // nettoyage défensif
      return;
    }

    const handler = this.handlers.get(key);
    if (!handler) {
      this.logger.warn(`No handler registered for cron key="${key}" — skipping`);
      return;
    }
    let report = 'Exécution terminée';
    let success = true;

    try {
      const result = await handler();
      if (typeof result === 'string') report = result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Cron "${key}" execution failed: ${msg}`, stack);
      report = `Erreur : ${msg}`;
      success = false;
    }

    // Stocker le rapport en mémoire
    this.lastRunReports.set(key, { report, ranAt: new Date() });

    // Notifier le panel admin
    if (this.notificationService) {
      void this.notificationService.create(
        success ? 'info' : 'alert',
        `CRON ${key}`,
        report,
      ).catch(() => undefined);
    }

    // Toujours mettre à jour lastRunAt, même si le handler a échoué
    try {
      await this.updateLastRunAt(config);
    } catch (updateErr) {
      this.logger.warn(`Cron "${key}" — échec mise à jour lastRunAt: ${String(updateErr)}`);
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
        byKey['sla-checker']?.intervalMinutes ?? 40,
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
