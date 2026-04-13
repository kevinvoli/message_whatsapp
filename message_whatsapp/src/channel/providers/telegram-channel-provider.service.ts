/**
 * TICKET-05-B — Stratégie provider Telegram (Bot API).
 *
 * Extrait de `ChannelService.create()` branche `provider === 'telegram'`.
 * Valide le token via getMe, génère un webhook secret, enregistre le webhook.
 * Les bots Telegram utilisent des tokens permanents (pas de rotation).
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AppLogger } from 'src/logging/app-logger.service';
import { CommunicationTelegramService } from 'src/communication_whapi/communication_telegram.service';
import { ChannelProviderStrategy } from '../domain/channel-provider-strategy.interface';
import { ChannelProviderRegistry } from '../domain/channel-provider.registry';
import { ChannelPersistenceHelper } from '../infrastructure/channel-persistence.helper';
import { CreateChannelDto } from '../dto/create-channel.dto';
import { UpdateChannelDto } from '../dto/update-channel.dto';
import { WhapiChannel } from '../entities/channel.entity';

@Injectable()
export class TelegramChannelProviderService implements ChannelProviderStrategy, OnModuleInit {
  readonly provider = 'telegram';

  constructor(
    private readonly helper: ChannelPersistenceHelper,
    private readonly telegramService: CommunicationTelegramService,
    private readonly logger: AppLogger,
    private readonly registry: ChannelProviderRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async create(dto: CreateChannelDto): Promise<WhapiChannel> {
    // Valider le token et récupérer le bot_id
    const botInfo = await this.telegramService.getMe(dto.token);
    const botId = String(botInfo.id);
    const nowEpoch = Math.floor(Date.now() / 1000);

    // Webhook secret : utiliser celui fourni ou en générer un aléatoire
    const webhookSecret = dto.webhook_secret?.trim() || randomBytes(32).toString('hex');

    const channel = this.helper.create({
      provider: 'telegram',
      external_id: botId,
      start_at: nowEpoch,
      token: dto.token,
      tokenExpiresAt: null, // Bot token permanent
      channel_id: botId,
      webhook_secret: webhookSecret,
      uptime: 0,
      version: 'telegram-bot-api',
      ip: 'telegram',
      device_id: 0,
      is_business: false,
      api_version: 'v7',
      core_version: 'telegram-bot-api',
    });

    const saved = await this.helper.save(channel);
    const tenantId = await this.helper.ensureTenantId(saved);

    await this.helper.upsertProviderMapping({
      tenant_id: tenantId,
      provider: 'telegram',
      external_id: botId,
      channel_id: botId,
    });

    // Enregistrer le webhook Telegram avec le secret du canal
    const appUrl = process.env.APP_URL?.replace(/\/$/, '');
    if (appUrl) {
      const webhookUrl = `${appUrl}/webhooks/telegram/${botId}`;
      try {
        await this.telegramService.registerWebhook(dto.token, webhookUrl, webhookSecret);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Impossible d'enregistrer le webhook Telegram: ${message}`,
          TelegramChannelProviderService.name,
        );
      }
    } else {
      this.logger.warn(
        'APP_URL non défini — webhook Telegram non enregistré automatiquement',
        TelegramChannelProviderService.name,
      );
    }

    this.logger.debug(
      `Telegram channel persisted: bot_id=${botId} username=@${botInfo.username}`,
      TelegramChannelProviderService.name,
    );

    return this.helper.findById(saved.id) as Promise<WhapiChannel>;
  }

  async update(channel: WhapiChannel, dto: UpdateChannelDto): Promise<WhapiChannel> {
    // Telegram : token permanent — mise à jour directe sans échange
    Object.assign(channel, dto);
    return this.helper.save(channel);
  }
}
