/**
 * TICKET-05-B — Stratégie provider Instagram (Graph API).
 *
 * Extrait de `ChannelService.create()` branche `provider === 'instagram'`.
 * Identique à Messenger sur la logique token (long-lived + PAT),
 * mais sans page_id et avec les constantes instagram-graph-api.
 */
import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from 'src/logging/app-logger.service';
import { MetaTokenService } from '../meta-token.service';
import { ChannelProviderStrategy } from '../domain/channel-provider-strategy.interface';
import { ChannelProviderRegistry } from '../domain/channel-provider.registry';
import { ChannelPersistenceHelper } from '../infrastructure/channel-persistence.helper';
import { CreateChannelDto } from '../dto/create-channel.dto';
import { UpdateChannelDto } from '../dto/update-channel.dto';
import { WhapiChannel } from '../entities/channel.entity';

@Injectable()
export class InstagramChannelProviderService implements ChannelProviderStrategy, OnModuleInit {
  readonly provider = 'instagram';

  constructor(
    private readonly helper: ChannelPersistenceHelper,
    private readonly metaTokenService: MetaTokenService,
    private readonly logger: AppLogger,
    private readonly registry: ChannelProviderRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async create(dto: CreateChannelDto): Promise<WhapiChannel> {
    const channelId = dto.channel_id?.trim();
    if (!channelId) {
      throw new ConflictException(
        'channel_id (instagram_business_account_id) requis pour provider=instagram',
      );
    }

    const externalId = dto.external_id?.trim() || channelId;
    const nowEpoch = Math.floor(Date.now() / 1000);

    let igToken = dto.token.trim();
    let igTokenExpiresAt: Date | null = dto.permanent_token ? new Date('2099-12-31') : null;

    if (!dto.permanent_token) {
      try {
        const exchanged = await this.metaTokenService.exchangeForLongLivedToken(
          dto.token,
          dto.meta_app_id,
          dto.meta_app_secret,
        );
        igToken = exchanged.accessToken;
        igTokenExpiresAt = exchanged.expiresAt;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Impossible d'échanger le token Instagram (token court gardé): ${message}`,
          InstagramChannelProviderService.name,
        );
      }
    }

    const channel = this.helper.create({
      provider: 'instagram',
      external_id: externalId,
      start_at: nowEpoch,
      token: igToken,
      tokenExpiresAt: igTokenExpiresAt,
      channel_id: channelId,
      meta_app_id: dto.meta_app_id ?? null,
      meta_app_secret: dto.meta_app_secret ?? null,
      verify_token: dto.verify_token ?? null,
      page_id: dto.page_id ?? null,
      uptime: 0,
      version: 'instagram',
      ip: 'instagram',
      device_id: 0,
      is_business: dto.is_business ?? true,
      api_version: process.env.META_API_VERSION ?? 'v21.0',
      core_version: 'instagram-graph-api',
    });

    const saved = await this.helper.save(channel);
    const tenantId = await this.helper.ensureTenantId(saved);

    await this.helper.upsertProviderMapping({
      tenant_id: tenantId,
      provider: 'instagram',
      external_id: externalId,
      channel_id: channelId,
    });

    this.logger.debug(
      `Instagram channel persisted: ${saved.channel_id}`,
      InstagramChannelProviderService.name,
    );
    return this.helper.findById(saved.id) as Promise<WhapiChannel>;
  }

  async update(channel: WhapiChannel, dto: UpdateChannelDto): Promise<WhapiChannel> {
    if (dto.token && dto.token.trim() !== channel.token) {
      dto.token = dto.token.trim();
      if (dto.permanent_token) {
        (dto as any).tokenExpiresAt = new Date('2099-12-31');
      } else {
        const appId = dto.meta_app_id || channel.meta_app_id;
        const appSecret = dto.meta_app_secret || channel.meta_app_secret;
        try {
          const exchanged = await this.metaTokenService.exchangeForLongLivedToken(
            dto.token,
            appId,
            appSecret,
          );
          dto.token = exchanged.accessToken;
          (dto as any).tokenExpiresAt = exchanged.expiresAt;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Impossible d'échanger le token Instagram à la mise à jour (token gardé): ${message}`,
            InstagramChannelProviderService.name,
          );
        }
      }
      // Tenter de dériver un PAT
      const pageId = channel.external_id ?? channel.channel_id;
      if (pageId) {
        const pat = await this.metaTokenService.getPageAccessToken(pageId, dto.token);
        if (pat) {
          this.logger.log(
            `Update Instagram: PAT dérivé pour le compte ${pageId}`,
            InstagramChannelProviderService.name,
          );
          dto.token = pat;
          (dto as any).tokenExpiresAt = new Date('2099-12-31');
        } else {
          this.logger.warn(
            `Update Instagram: PAT non dérivé pour ${pageId} — token stocké tel quel`,
            InstagramChannelProviderService.name,
          );
        }
      }
    }
    Object.assign(channel, dto);
    return this.helper.save(channel);
  }
}
