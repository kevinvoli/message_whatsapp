/**
 * TICKET-05-B — Stratégie provider Meta (WhatsApp Business Cloud API).
 *
 * Extrait de `ChannelService.create()` branche `provider === 'meta'`.
 */
import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { ApplicationService } from 'src/application/application.service';
import { AppLogger } from 'src/logging/app-logger.service';
import { MetaTokenService } from '../meta-token.service';
import { ChannelProviderStrategy } from '../domain/channel-provider-strategy.interface';
import { ChannelProviderRegistry } from '../domain/channel-provider.registry';
import { ChannelPersistenceHelper } from '../infrastructure/channel-persistence.helper';
import { CreateChannelDto } from '../dto/create-channel.dto';
import { UpdateChannelDto } from '../dto/update-channel.dto';
import { WhapiChannel } from '../entities/channel.entity';

@Injectable()
export class MetaChannelProviderService implements ChannelProviderStrategy, OnModuleInit {
  readonly provider = 'meta';

  constructor(
    private readonly helper: ChannelPersistenceHelper,
    private readonly metaTokenService: MetaTokenService,
    private readonly logger: AppLogger,
    private readonly registry: ChannelProviderRegistry,
    private readonly applicationService: ApplicationService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async create(dto: CreateChannelDto): Promise<WhapiChannel> {
    const channelId = dto.channel_id?.trim();
    if (!channelId) {
      throw new ConflictException('channel_id (phone_number_id Meta) requis pour provider=meta');
    }

    if (!dto.application_id) {
      throw new BadRequestException(
        `application_id requis pour créer un canal ${this.provider}. Créez d'abord une application dans "Applications Meta".`,
      );
    }

    const externalId = dto.external_id?.trim() || channelId;
    const nowEpoch = Math.floor(Date.now() / 1000);

    // Résoudre les credentials : application liée > champs directs du DTO
    let effectiveAppId = dto.meta_app_id;
    let effectiveAppSecret = dto.meta_app_secret;
    let isPermanent = !!dto.permanent_token;
    let metaToken = dto.token.trim();

    if (dto.application_id) {
      const app = await this.applicationService.findOne(dto.application_id);
      effectiveAppId = app.appId;
      effectiveAppSecret = app.appSecret;
      if (app.systemToken?.trim()) {
        isPermanent = true;
        metaToken = app.systemToken.trim();
      }
    }

    let metaTokenExpiresAt: Date | null = isPermanent ? new Date('2099-12-31') : null;

    if (!isPermanent) {
      try {
        const exchanged = await this.metaTokenService.exchangeForLongLivedToken(
          metaToken,
          effectiveAppId,
          effectiveAppSecret,
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
      application_id: dto.application_id ?? null,
      meta_app_id: dto.application_id ? null : (dto.meta_app_id ?? null),
      meta_app_secret: dto.application_id ? null : (dto.meta_app_secret ?? null),
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
    return this.helper.findById(saved.id) as Promise<WhapiChannel>;
  }

  async update(channel: WhapiChannel, dto: UpdateChannelDto): Promise<WhapiChannel> {
    if (dto.token && dto.token.trim() !== channel.token) {
      dto.token = dto.token.trim();
      if (dto.permanent_token) {
        (dto as any).tokenExpiresAt = new Date('2099-12-31');
      } else {
        const { appId, appSecret } = await this.resolveUpdateCredentials(channel, dto);
        try {
          const exchanged = await this.metaTokenService.exchangeForLongLivedToken(dto.token, appId, appSecret);
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

  private async resolveUpdateCredentials(
    channel: WhapiChannel,
    dto: UpdateChannelDto,
  ): Promise<{ appId: string | null | undefined; appSecret: string | null | undefined }> {
    const applicationId = dto.application_id ?? channel.application_id;
    if (applicationId) {
      try {
        const app = await this.applicationService.findOne(applicationId);
        return { appId: app.appId, appSecret: app.appSecret };
      } catch {
        // application introuvable → fallback champs directs
      }
    }
    return {
      appId: dto.meta_app_id || channel.meta_app_id,
      appSecret: dto.meta_app_secret || channel.meta_app_secret,
    };
  }
}
