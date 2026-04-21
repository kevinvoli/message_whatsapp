import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';
import { ChannelService } from 'src/channel/channel.service';

export interface ConfigEntry {
  key: string;
  label: string;
  category: string;
  description?: string;
  isSecret?: boolean;
  isReadonly?: boolean;
}

export interface WebhookEntry {
  provider: string;
  label: string;
  url: string;
  note: string;
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
  { key: 'WHAPI_URL', label: 'URL API Whapi', category: 'whapi' },
  { key: 'WHAPI_WEBHOOK_SECRET_HEADER', label: 'Header secret webhook Whapi', category: 'whapi' },
  { key: 'WHAPI_WEBHOOK_SECRET_VALUE', label: 'Valeur secret webhook Whapi', category: 'whapi', isSecret: true },
  { key: 'WHAPI_WEBHOOK_SECRET_VALUE_PREVIOUS', label: 'Valeur secret webhook Whapi (précédente)', category: 'whapi', isSecret: true },

  // ─── Meta / WhatsApp Business ───────────────────────────────────────────────
  { key: 'META_API_VERSION', label: 'Version API Meta', category: 'meta' },

  // ─── Feature flags ──────────────────────────────────────────────────────────
  { key: 'FF_UNIFIED_WEBHOOK_ROUTER', label: 'Activer le routeur webhook unifié', category: 'feature_flags', description: 'true / false' },
  { key: 'FF_SHADOW_UNIFIED', label: 'Mode shadow (routing parallèle)', category: 'feature_flags', description: 'true / false' },
  { key: 'FF_UNIFIED_WHAPI_PCT', label: 'Pourcentage trafic Whapi unifié', category: 'feature_flags', description: '0–100' },
  { key: 'FF_FLOWBOT_ACTIVE', label: 'FlowBot actif', category: 'feature_flags', description: 'true / false — active le moteur FlowBot' },

  // ─── Intégration ERP ─────────────────────────────────────────────────────────
  { key: 'INTEGRATION_ERP_URL', label: 'URL webhook sortant ERP', category: 'integration', description: 'Endpoint de votre ERP qui reçoit les événements de la plateforme' },
  { key: 'INTEGRATION_SECRET', label: 'Secret partagé ERP', category: 'integration', description: 'Header x-integration-secret (entrant) + signature HMAC-SHA256 (sortant)', isSecret: true },

];


@Injectable()
export class SystemConfigService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SystemConfigService.name);

  private channelService: ChannelService | null = null;

  constructor(
    @InjectRepository(SystemConfig)
    private readonly repo: Repository<SystemConfig>,
    private readonly moduleRef: ModuleRef,
  ) {}

  private getChannelService(): ChannelService {
    if (!this.channelService) {
      this.channelService = this.moduleRef.get(ChannelService, { strict: false });
    }
    return this.channelService!;
  }

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

  async getWebhookUrls(): Promise<WebhookEntry[]> {
    const host = (
      process.env.SERVER_PUBLIC_HOST ??
      process.env.APP_URL ??
      ''
    ).replace(/\/$/, '');

    const base = host || null;

    const fmt = (path: string) =>
      base ? `${base}${path}` : null;

    const entries: WebhookEntry[] = [
      {
        provider: 'whapi',
        label: 'WhatsApp / Whapi',
        url: fmt('/webhooks/whapi') ?? '',
        note: 'À coller dans le champ "Webhook URL" du dashboard Whapi',
      },
      {
        provider: 'meta',
        label: 'Meta WhatsApp Business',
        url: fmt('/webhooks/whatsapp') ?? '',
        note: 'Callback URL dans Facebook Developers → Webhooks → whatsapp_business_account',
      },
      {
        provider: 'messenger',
        label: 'Facebook Messenger',
        url: fmt('/webhooks/messenger') ?? '',
        note: 'Callback URL dans Facebook Developers → Webhooks → page',
      },
      {
        provider: 'instagram',
        label: 'Instagram Direct',
        url: fmt('/webhooks/instagram') ?? '',
        note: 'Callback URL dans Facebook Developers → Webhooks → instagram',
      },
    ];

    // Telegram : une URL par bot enregistré dans whapi_channels
    const allChannels = await this.getChannelService().findAll();
    const telegramChannels = allChannels.filter((c) => c.provider === 'telegram');

    if (telegramChannels.length === 0) {
      entries.push({
        provider: 'telegram',
        label: 'Telegram Bot',
        url: fmt('/webhooks/telegram/:botId') ?? '',
        note: "Remplacer :botId par l'identifiant numérique du bot. Enregistrer via l'API Telegram setWebhook.",
      });
    } else {
      for (const ch of telegramChannels) {
        const botId = ch.channel_id;
        entries.push({
          provider: 'telegram',
          label: `Telegram — ${ch.label ?? botId}`,
          url: fmt(`/webhooks/telegram/${botId}`) ?? '',
          note: "URL à enregistrer via setWebhook dans l'API Telegram",
        });
      }
    }

    return entries;
  }
}
