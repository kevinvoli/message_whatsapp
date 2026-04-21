import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { AiModuleConfig, AiModuleName } from './entities/ai-module-config.entity';
import { AiExecutionLog } from './entities/ai-execution-log.entity';
import { UpdateModuleConfigDto } from './dto/update-module-config.dto';

export interface LogAiExecutionDto {
  module_name: string;
  scenario?: string;
  triggered_by?: string;
  chat_id?: string;
  channel_id?: string;
  success: boolean;
  latency_ms: number;
  fallback_used?: boolean;
  human_validation_used?: boolean;
  error_message?: string;
  tokens_used?: number;
}

export interface AiDashboard {
  total_executions: number;
  success_rate: number;
  fallback_rate: number;
  avg_latency_ms: number;
  modules: AiModuleStats[];
}

export interface AiModuleStats {
  module_name: string;
  label: string;
  is_enabled: boolean;
  total: number;
  success_rate: number;
  fallback_rate: number;
  avg_latency_ms: number;
}

const MODULE_DEFAULTS: Array<{ name: AiModuleName; label: string }> = [
  { name: 'suggestions',    label: 'Suggestions de réponses' },
  { name: 'rewrite',        label: 'Correction / Réécriture' },
  { name: 'summary',        label: 'Résumé de conversation' },
  { name: 'qualification',  label: 'Qualification assistée' },
  { name: 'flowbot',        label: 'Nœud IA dans FlowBot' },
  { name: 'followup',       label: 'Relance assistée' },
  { name: 'dossier',        label: 'Synthèse dossier client' },
  { name: 'quality',        label: 'Analyse qualité / Coaching' },
];

const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  MODULE_DEFAULTS.map(m => [m.name, m.label]),
);

@Injectable()
export class AiGovernanceService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(AiModuleConfig)
    private readonly configRepo: Repository<AiModuleConfig>,
    @InjectRepository(AiExecutionLog)
    private readonly logRepo: Repository<AiExecutionLog>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const { name } of MODULE_DEFAULTS) {
      const exists = await this.configRepo.findOne({ where: { module_name: name } });
      if (!exists) {
        await this.configRepo.save(
          this.configRepo.create({ module_name: name, is_enabled: false }),
        );
      }
    }
  }

  // ── Lecture configuration ──────────────────────────────────────────────────

  async getAllModules(): Promise<(AiModuleConfig & { label: string })[]> {
    const configs = await this.configRepo.find();
    const map = new Map(configs.map(c => [c.module_name, c]));

    return MODULE_DEFAULTS.map(({ name, label }) => {
      const cfg = map.get(name) ?? this.configRepo.create({ module_name: name, is_enabled: false });
      return Object.assign(cfg, { label });
    });
  }

  async getModuleConfig(moduleName: string): Promise<AiModuleConfig | null> {
    return this.configRepo.findOne({ where: { module_name: moduleName } });
  }

  async isModuleEnabled(moduleName: string): Promise<boolean> {
    const cfg = await this.getModuleConfig(moduleName);
    if (!cfg) return false;
    if (!cfg.is_enabled) return false;

    // Vérification horaire
    if (cfg.schedule_start && cfg.schedule_end) {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (hhmm < cfg.schedule_start || hhmm > cfg.schedule_end) return false;
    }

    return true;
  }

  // ── Modification ──────────────────────────────────────────────────────────

  async updateModuleConfig(moduleName: string, dto: UpdateModuleConfigDto): Promise<AiModuleConfig & { label: string }> {
    let cfg = await this.configRepo.findOne({ where: { module_name: moduleName } });
    if (!cfg) {
      cfg = this.configRepo.create({ module_name: moduleName, is_enabled: false });
    }
    Object.assign(cfg, dto);
    const saved = await this.configRepo.save(cfg);
    return Object.assign(saved, { label: MODULE_LABELS[moduleName] ?? moduleName });
  }

  // ── Journalisation ─────────────────────────────────────────────────────────

  async log(dto: LogAiExecutionDto): Promise<void> {
    const entry = this.logRepo.create({
      module_name: dto.module_name,
      scenario: dto.scenario ?? null,
      triggered_by: dto.triggered_by ?? null,
      chat_id: dto.chat_id ?? null,
      channel_id: dto.channel_id ?? null,
      success: dto.success,
      latency_ms: dto.latency_ms,
      fallback_used: dto.fallback_used ?? false,
      human_validation_used: dto.human_validation_used ?? false,
      error_message: dto.error_message ?? null,
      tokens_used: dto.tokens_used ?? null,
    });
    await this.logRepo.save(entry);
  }

  // ── Logs paginés ──────────────────────────────────────────────────────────

  async getLogs(page = 1, limit = 50, module_name?: string): Promise<{ items: AiExecutionLog[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (module_name) where.module_name = module_name;

    const [items, total] = await this.logRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard(since?: Date): Promise<AiDashboard> {
    const qb = this.logRepo.createQueryBuilder('l');
    if (since) qb.where('l.createdAt >= :since', { since });

    const rows: { module_name: string; cnt: string; ok: string; fallback: string; avg_latency: string }[] =
      await qb
        .select('l.module_name', 'module_name')
        .addSelect('COUNT(*)', 'cnt')
        .addSelect('SUM(CASE WHEN l.success = 1 THEN 1 ELSE 0 END)', 'ok')
        .addSelect('SUM(CASE WHEN l.fallback_used = 1 THEN 1 ELSE 0 END)', 'fallback')
        .addSelect('AVG(l.latency_ms)', 'avg_latency')
        .groupBy('l.module_name')
        .getRawMany();

    const configs = await this.getAllModules();
    const cfgMap = new Map(configs.map(c => [c.module_name, c]));

    let totalExec = 0, totalOk = 0, totalFallback = 0, totalLatency = 0;

    const modules: AiModuleStats[] = MODULE_DEFAULTS.map(({ name, label }) => {
      const row = rows.find(r => r.module_name === name);
      const cnt = row ? parseInt(row.cnt) : 0;
      const ok  = row ? parseInt(row.ok) : 0;
      const fb  = row ? parseInt(row.fallback) : 0;
      const lat = row ? parseFloat(row.avg_latency) : 0;

      totalExec    += cnt;
      totalOk      += ok;
      totalFallback += fb;
      totalLatency += lat * cnt;

      return {
        module_name: name,
        label,
        is_enabled: cfgMap.get(name)?.is_enabled ?? false,
        total: cnt,
        success_rate: cnt > 0 ? Math.round((ok / cnt) * 100) : 0,
        fallback_rate: cnt > 0 ? Math.round((fb / cnt) * 100) : 0,
        avg_latency_ms: cnt > 0 ? Math.round(lat) : 0,
      };
    });

    return {
      total_executions: totalExec,
      success_rate:    totalExec > 0 ? Math.round((totalOk / totalExec) * 100) : 0,
      fallback_rate:   totalExec > 0 ? Math.round((totalFallback / totalExec) * 100) : 0,
      avg_latency_ms:  totalExec > 0 ? Math.round(totalLatency / totalExec) : 0,
      modules,
    };
  }
}
