import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';

export interface ConfigEntry {
  key: string;
  label: string;
  category: string;
  description?: string;
  isSecret?: boolean;
  isReadonly?: boolean;
}

/** Catalogue des clés gérées par ce module (ordre d'affichage + métadonnées). */
const CONFIG_CATALOGUE: ConfigEntry[] = [
  // ─── Général ────────────────────────────────────────────────────────────────
  { key: 'SERVER_PORT', label: 'Port serveur', category: 'general' },
  { key: 'WS_PORT', label: 'Port WebSocket', category: 'general' },
  { key: 'SERVER_PUBLIC_HOST', label: 'URL publique du serveur', category: 'general', description: 'Utilisée pour les liens médias Meta (ex: https://your-domain.com)' },
  { key: 'APP_URL', label: 'URL de l\'application', category: 'general', description: 'Utilisée pour enregistrer le webhook Telegram' },
  { key: 'CORS_ORIGINS', label: 'Origines CORS autorisées', category: 'general', description: 'Liste séparée par des virgules, sans espaces' },

  // ─── WhatsApp / Whapi ───────────────────────────────────────────────────────
  { key: 'WHAPI_TOKEN', label: 'Token Whapi', category: 'whapi', isSecret: true },
  { key: 'WHAPI_URL', label: 'URL API Whapi', category: 'whapi' },
  { key: 'WHATSAPP_NUMBER', label: 'Numéro WhatsApp', category: 'whapi' },
  { key: 'WHAPI_WEBHOOK_SECRET_HEADER', label: 'Header secret webhook Whapi', category: 'whapi' },
  { key: 'WHAPI_WEBHOOK_SECRET_VALUE', label: 'Valeur secret webhook Whapi', category: 'whapi', isSecret: true },
  { key: 'WHAPI_WEBHOOK_SECRET_VALUE_PREVIOUS', label: 'Valeur secret webhook Whapi (précédente)', category: 'whapi', isSecret: true },

  // ─── Meta / WhatsApp Business ───────────────────────────────────────────────
  { key: 'META_API_VERSION', label: 'Version API Meta', category: 'meta' },
  { key: 'WHATSAPP_VERIFY_TOKEN', label: 'Token de vérification webhook WhatsApp', category: 'meta', isSecret: true },
  { key: 'WHATSAPP_APP_SECRET', label: 'App Secret WhatsApp (HMAC webhooks)', category: 'meta', isSecret: true },
  { key: 'WHATSAPP_APP_SECRET_PREVIOUS', label: 'App Secret WhatsApp (précédent)', category: 'meta', isSecret: true },
  { key: 'META_APP_ID', label: 'Meta App ID', category: 'meta' },
  { key: 'META_APP_SECRET', label: 'Meta App Secret (échange token longue durée)', category: 'meta', isSecret: true },

  // ─── Messenger ──────────────────────────────────────────────────────────────
  { key: 'MESSENGER_VERIFY_TOKEN', label: 'Token de vérification webhook Messenger', category: 'messenger', isSecret: true },

  // ─── Instagram ──────────────────────────────────────────────────────────────
  { key: 'INSTAGRAM_VERIFY_TOKEN', label: 'Token de vérification webhook Instagram', category: 'instagram', isSecret: true },

  // ─── Telegram ───────────────────────────────────────────────────────────────
  { key: 'TELEGRAM_WEBHOOK_SECRET', label: 'Secret webhook Telegram', category: 'telegram', isSecret: true, description: 'Token arbitraire transmis à setWebhook (X-Telegram-Bot-Api-Secret-Token)' },

  // ─── Feature flags ──────────────────────────────────────────────────────────
  { key: 'FF_UNIFIED_WEBHOOK_ROUTER', label: 'Activer le routeur webhook unifié', category: 'feature_flags', description: 'true / false' },
  { key: 'FF_SHADOW_UNIFIED', label: 'Mode shadow (routing parallèle)', category: 'feature_flags', description: 'true / false' },
  { key: 'FF_UNIFIED_WHAPI_PCT', label: 'Pourcentage trafic Whapi unifié', category: 'feature_flags', description: '0–100' },

  // ─── Cron ───────────────────────────────────────────────────────────────────
  { key: 'REDISPATCH_CRON', label: 'Cron de re-dispatch', category: 'cron', description: 'Expression cron (ex: */30 * * * * *)' },
  { key: 'MESSAGE_RESPONSE_TIMEOUT_HOURS', label: 'Délai de réponse (heures)', category: 'cron', description: 'Entre 1 et 240 heures' },
];

@Injectable()
export class SystemConfigService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(
    @InjectRepository(SystemConfig)
    private readonly repo: Repository<SystemConfig>,
  ) {}

  async onApplicationBootstrap() {
    await this.seedFromEnv();
    await this.patchProcessEnv();
  }

  /** Ajoute en DB les clés du catalogue qui n'existent pas encore, en lisant process.env. */
  private async seedFromEnv() {
    for (const entry of CONFIG_CATALOGUE) {
      const existing = await this.repo.findOne({ where: { configKey: entry.key } });
      if (existing) continue;

      const envValue = process.env[entry.key] ?? null;
      await this.repo.save(
        this.repo.create({
          configKey: entry.key,
          configValue: envValue,
          category: entry.category,
          label: entry.label,
          description: entry.description ?? null,
          isSecret: entry.isSecret ?? false,
          isReadonly: entry.isReadonly ?? false,
        }),
      );
    }
    this.logger.log('SystemConfig: seed terminé');
  }

  /** Écrase process.env avec les valeurs DB (non-null, non-vides). */
  private async patchProcessEnv() {
    const all = await this.repo.find();
    let patched = 0;
    for (const cfg of all) {
      if (cfg.configValue !== null && cfg.configValue !== '') {
        process.env[cfg.configKey] = cfg.configValue;
        patched++;
      }
    }
    this.logger.log(`SystemConfig: ${patched} variables patchées dans process.env`);
  }

  async getAll(): Promise<SystemConfig[]> {
    return this.repo.find({ order: { category: 'ASC', configKey: 'ASC' } });
  }

  async getByCategory(category: string): Promise<SystemConfig[]> {
    return this.repo.find({
      where: { category },
      order: { configKey: 'ASC' },
    });
  }

  async get(key: string): Promise<string | null> {
    const cfg = await this.repo.findOne({ where: { configKey: key } });
    return cfg?.configValue ?? process.env[key] ?? null;
  }

  async set(key: string, value: string): Promise<SystemConfig> {
    let cfg = await this.repo.findOne({ where: { configKey: key } });

    if (cfg?.isReadonly) {
      throw new Error(`La clé "${key}" est en lecture seule.`);
    }

    const meta = CONFIG_CATALOGUE.find((e) => e.key === key);

    if (cfg) {
      cfg.configValue = value;
      cfg = await this.repo.save(cfg);
    } else {
      cfg = await this.repo.save(
        this.repo.create({
          configKey: key,
          configValue: value,
          category: meta?.category ?? 'general',
          label: meta?.label ?? key,
          description: meta?.description ?? null,
          isSecret: meta?.isSecret ?? false,
          isReadonly: meta?.isReadonly ?? false,
        }),
      );
    }

    // Patch process.env immédiatement
    process.env[key] = value;
    return cfg;
  }

  async setBulk(entries: { key: string; value: string }[]): Promise<void> {
    for (const { key, value } of entries) {
      await this.set(key, value);
    }
  }

  getCatalogue(): ConfigEntry[] {
    return CONFIG_CATALOGUE;
  }
}
