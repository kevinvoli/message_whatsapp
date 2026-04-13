/**
 * TICKET-05-B — Stratégie provider Meta (WhatsApp Business Cloud API).
 *
 * Extrait de `ChannelService.create()` branche `provider === 'meta'`.
 */
import { ConflictException, Injectable } from '@nestjs/common';
import { AppLogger } from 'src/logging/app-logger.service';
import { MetaTokenService } from '../meta-token.service';
import { ChannelProviderStrategy } from '../domain/channel-provider-strategy.interface';
import { ChannelPersistenceHelper } from '../infrastructure/channel-persistence.helper';
import { CreateChannelDto } from '../dto/create-channel.dto';
import { UpdateChannelDto } from '../dto/update-channel.dto';
import { WhapiChannel } from '../entities/channel.entity';

@Injectable()
export class MetaChannelProviderService implements ChannelProviderStrategy {
  readonly provider = 'meta';

  constructor(
    private readonly helper: ChannelPersistenceHelper,
    private readonly metaTokenService: MetaTokenService,
    private readonly logger: AppLogger,
  ) {}

  async create(dto: CreateChannelDto): Promise<WhapiChannel> {
    const channelId = dto.channel_id?.trim();
    if (!channelId) {
      throw new ConflictException('channel_id (phone_number_id Meta) requis pour provider=meta');
    }

    const externalId = dto.external_id?.trim() || channelId;
    const nowEpoch = Math.floor(Date.now() / 1000);

    let metaToken = dto.token.trim();
    let metaTokenExpiresAt: Date | null = dto.permanent_token ? new Date('2099-12-31') : null;

    if (!dto.permanent_token) {
      try {
        const exchanged = await this.metaTokenService.exchangeForLongLivedToken(
          dto.token,
          dto.meta_app_id,
          dto.meta_app_secret,
        );
        metaToken = exchanged.accessToken;
        metaTokenExpiresAt = exchanged.expiresAt;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Impossible d'échanger le token Meta (token court gardé): ${message}`,
          MetaChannelProviderService.name,
        );
      }
    }

    const channel = this.helper.create({
      provider: 'meta',
      external_id: externalId,
      start_at: nowEpoch,
      token: metaToken,
      tokenExpiresAt: metaTokenExpiresAt,
      channel_id: channelId,
      meta_app_id: dto.meta_app_id ?? null,
      meta_app_secret: dto.meta_app_secret ?? null,
      verify_token: dto.verify_token ?? null,
      uptime: 0,
      version: 'meta',
      ip: 'meta',
      device_id: 0,
      is_business: dto.is_business ?? true,
      api_version: process.env.META_API_VERSION ?? 'v21.0',
      core_version: 'meta-cloud-api',
    });

    const saved = await this.helper.save(channel);
    const tenantId = await this.helper.ensureTenantId(saved);

    await this.helper.upsertProviderMapping({
      tenant_id: tenantId,
      provider: 'meta',
      external_id: externalId,
      channel_id: channelId,
    });

    this.logger.debug(`Meta channel persisted: ${saved.channel_id}`, MetaChannelProviderService.name);
    return this.helper.findById(saved.id);
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
            `Impossible d'échanger le token Meta à la mise à jour (token gardé): ${message}`,
            MetaChannelProviderService.name,
          );
        }
      }
    }
    Object.assign(channel, dto);
    return this.helper.save(channel);
  }
}
