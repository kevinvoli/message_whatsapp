/**
 * TICKET-05-B — Stratégie provider Messenger (Facebook Pages Messaging).
 *
 * Extrait de `ChannelService.create()` branche `provider === 'messenger'`.
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
export class MessengerChannelProviderService implements ChannelProviderStrategy {
  readonly provider = 'messenger';

  constructor(
    private readonly helper: ChannelPersistenceHelper,
    private readonly metaTokenService: MetaTokenService,
    private readonly logger: AppLogger,
  ) {}

  async create(dto: CreateChannelDto): Promise<WhapiChannel> {
    const channelId = dto.channel_id?.trim();
    if (!channelId) {
      throw new ConflictException('channel_id (page_id Facebook) requis pour provider=messenger');
    }

    const externalId = dto.external_id?.trim() || channelId;
    const nowEpoch = Math.floor(Date.now() / 1000);

    let messengerToken = dto.token.trim();
    let messengerTokenExpiresAt: Date | null = dto.permanent_token ? new Date('2099-12-31') : null;

    if (!dto.permanent_token) {
      try {
        const exchanged = await this.metaTokenService.exchangeForLongLivedToken(
          dto.token,
          dto.meta_app_id,
          dto.meta_app_secret,
        );
        messengerToken = exchanged.accessToken;
        messengerTokenExpiresAt = exchanged.expiresAt;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Impossible d'échanger le token Messenger (token court gardé): ${message}`,
          MessengerChannelProviderService.name,
        );
      }
    }

    // Tenter de dériver un Page Access Token
    const pat = await this.metaTokenService.getPageAccessToken(externalId, messengerToken);
    if (pat) {
      this.logger.log(
        `Messenger: PAT dérivé avec succès pour la page ${externalId}`,
        MessengerChannelProviderService.name,
      );
      messengerToken = pat;
      if (!messengerTokenExpiresAt) {
        messengerTokenExpiresAt = new Date('2099-12-31');
      }
    } else {
      this.logger.warn(
        `Messenger: PAT non dérivé pour page ${externalId} — token stocké tel quel. Vérifier les permissions pages_messaging.`,
        MessengerChannelProviderService.name,
      );
    }

    const channel = this.helper.create({
      provider: 'messenger',
      external_id: externalId,
      start_at: nowEpoch,
      token: messengerToken,
      tokenExpiresAt: messengerTokenExpiresAt,
      channel_id: channelId,
      meta_app_id: dto.meta_app_id ?? null,
      meta_app_secret: dto.meta_app_secret ?? null,
      verify_token: dto.verify_token ?? null,
      page_id: dto.page_id ?? null,
      uptime: 0,
      version: 'messenger',
      ip: 'messenger',
      device_id: 0,
      is_business: dto.is_business ?? true,
      api_version: process.env.META_API_VERSION ?? 'v21.0',
      core_version: 'messenger-graph-api',
    });

    const saved = await this.helper.save(channel);
    const tenantId = await this.helper.ensureTenantId(saved);

    await this.helper.upsertProviderMapping({
      tenant_id: tenantId,
      provider: 'messenger',
      external_id: externalId,
      channel_id: channelId,
    });

    this.logger.debug(
      `Messenger channel persisted: ${saved.channel_id}`,
      MessengerChannelProviderService.name,
    );
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
            `Impossible d'échanger le token Messenger (token gardé): ${message}`,
            MessengerChannelProviderService.name,
          );
        }
      }
      // PAT pour Messenger
      const pageId = channel.external_id ?? channel.channel_id;
      if (pageId) {
        const pat = await this.metaTokenService.getPageAccessToken(pageId, dto.token);
        if (pat) {
          this.logger.log(`Update Messenger: PAT dérivé pour page ${pageId}`, MessengerChannelProviderService.name);
          dto.token = pat;
          (dto as any).tokenExpiresAt = new Date('2099-12-31');
        } else {
          this.logger.warn(`Update Messenger: PAT non dérivé pour page ${pageId}`, MessengerChannelProviderService.name);
        }
      }
    }
    Object.assign(channel, dto);
    return this.helper.save(channel);
  }
}
