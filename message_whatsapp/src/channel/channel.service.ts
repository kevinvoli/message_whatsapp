import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';

import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { WhapiChannel } from './entities/channel.entity';
import { ProviderChannel } from './entities/provider-channel.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { MetaTokenService } from './meta-token.service';
import { CommunicationTelegramService } from 'src/communication_whapi/communication_telegram.service';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class ChannelService {
  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    @InjectRepository(ProviderChannel)
    private readonly providerChannelRepository: Repository<ProviderChannel>,
    @InjectRepository(WhatsappPoste)
    private readonly posteRepository: Repository<WhatsappPoste>,
    private readonly connmunicationService: CommunicationWhapiService,
    private readonly metaTokenService: MetaTokenService,
    private readonly telegramService: CommunicationTelegramService,
    private readonly logger: AppLogger,
  ) {}

  async create(dto: CreateChannelDto) {
    const provider = dto.provider ?? 'whapi';

    const existingByToken = await this.channelRepository.findOne({
      where: { token: dto.token },
    });
    if (existingByToken) {
      throw new ConflictException('Un canal avec ce token existe déjà');
    }

    if (dto.channel_id?.trim()) {
      const existingByChannelId = await this.channelRepository.findOne({
        where: { channel_id: dto.channel_id.trim() },
      });
      if (existingByChannelId) {
        throw new ConflictException(
          `Un canal avec cet identifiant (${dto.channel_id.trim()}) existe déjà`,
        );
      }
    }

    if (provider === 'telegram') {
      // Valider le token via getMe et récupérer le bot_id
      const botInfo = await this.telegramService.getMe(dto.token);
      const botId = String(botInfo.id);
      const nowEpoch = Math.floor(Date.now() / 1000);

      // Webhook secret : utiliser celui fourni ou en générer un aléatoire
      const webhookSecret = dto.webhook_secret?.trim() || randomBytes(32).toString('hex');

      const telegramChannel = this.channelRepository.create({
        provider: 'telegram',
        external_id: botId,
        start_at: nowEpoch,
        token: dto.token,
        tokenExpiresAt: null,  // Bot token permanent
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

      const savedTg = await this.channelRepository.save(telegramChannel);
      const tenantId = await this.ensureTenantId(savedTg);
      await this.upsertProviderMapping({
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
            ChannelService.name,
          );
        }
      } else {
        this.logger.warn(
          'APP_URL non défini — webhook Telegram non enregistré automatiquement',
          ChannelService.name,
        );
      }

      this.logger.debug(
        `Telegram channel persisted: bot_id=${botId} username=@${botInfo.username}`,
        ChannelService.name,
      );

      return this.channelRepository.findOne({
        where: { id: savedTg.id },
      });
    }

    if (provider === 'messenger') {
      const channelId = dto.channel_id?.trim();
      if (!channelId) {
        throw new ConflictException(
          'channel_id (page_id Facebook) requis pour provider=messenger',
        );
      }

      const externalId = dto.external_id?.trim() || channelId;
      const nowEpoch = Math.floor(Date.now() / 1000);

      let messengerToken = dto.token.trim();
      let messengerTokenExpiresAt: Date | null = dto.permanent_token
        ? new Date('2099-12-31')
        : null;

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
            ChannelService.name,
          );
        }
      }

      // Tenter de dériver un Page Access Token depuis le token long-lived.
      // Un System User Token ou User Token ne peut pas appeler /{page-id}/messages directement —
      // il faut un PAT scopé à la page. Si la dérivation réussit, on stocke le PAT.
      const pat = await this.metaTokenService.getPageAccessToken(externalId, messengerToken);
      if (pat) {
        this.logger.log(
          `Messenger: PAT dérivé avec succès pour la page ${externalId}`,
          ChannelService.name,
        );
        messengerToken = pat;
        // Le PAT d'un System User est permanent ; sinon on garde l'expiration du long-lived
        if (!messengerTokenExpiresAt) {
          messengerTokenExpiresAt = new Date('2099-12-31');
        }
      } else {
        this.logger.warn(
          `Messenger: PAT non dérivé pour page ${externalId} — token stocké tel quel. Vérifier les permissions pages_messaging.`,
          ChannelService.name,
        );
      }

      const messengerChannel = this.channelRepository.create({
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

      const savedMessenger =
        await this.channelRepository.save(messengerChannel);
      const tenantId = await this.ensureTenantId(savedMessenger);
      await this.upsertProviderMapping({
        tenant_id: tenantId,
        provider: 'messenger',
        external_id: externalId,
        channel_id: channelId,
      });

      this.logger.debug(
        `Messenger channel persisted: ${savedMessenger.channel_id}`,
        ChannelService.name,
      );

      return this.channelRepository.findOne({
        where: { id: savedMessenger.id },
      });
    }

    if (provider === 'instagram') {
      const channelId = dto.channel_id?.trim();
      if (!channelId) {
        throw new ConflictException(
          'channel_id (instagram_business_account_id) requis pour provider=instagram',
        );
      }

      const externalId = dto.external_id?.trim() || channelId;
      const nowEpoch = Math.floor(Date.now() / 1000);

      let igToken = dto.token.trim();
      let igTokenExpiresAt: Date | null = dto.permanent_token
        ? new Date('2099-12-31')
        : null;

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
            ChannelService.name,
          );
        }
      }

      const igChannel = this.channelRepository.create({
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

      const savedIg = await this.channelRepository.save(igChannel);
      const tenantId = await this.ensureTenantId(savedIg);
      await this.upsertProviderMapping({
        tenant_id: tenantId,
        provider: 'instagram',
        external_id: externalId,
        channel_id: channelId,
      });

      this.logger.debug(
        `Instagram channel persisted: ${savedIg.channel_id}`,
        ChannelService.name,
      );

      return this.channelRepository.findOne({
        where: { id: savedIg.id },
      });
    }

    if (provider === 'meta') {
      const channelId = dto.channel_id?.trim();
      if (!channelId) {
        throw new ConflictException(
          'channel_id (phone_number_id Meta) requis pour provider=meta',
        );
      }

      const externalId = dto.external_id?.trim() || channelId;
      const nowEpoch = Math.floor(Date.now() / 1000);

      let metaToken = dto.token.trim();
      let metaTokenExpiresAt: Date | null = dto.permanent_token
        ? new Date('2099-12-31')
        : null;

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
            ChannelService.name,
          );
        }
      }

      const metaChannel = this.channelRepository.create({
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

      const savedMeta = await this.channelRepository.save(metaChannel);
      const tenantId = await this.ensureTenantId(savedMeta);
      await this.upsertProviderMapping({
        tenant_id: tenantId,
        provider: 'meta',
        external_id: externalId,
        channel_id: channelId,
      });

      this.logger.debug(
        `Meta channel persisted: ${savedMeta.channel_id}`,
        ChannelService.name,
      );

      return this.channelRepository.findOne({
        where: { id: savedMeta.id },
      });
    }

    const channel = await this.connmunicationService.getChannel(dto);

    if (!channel) {
      return;
    }

    const whapiChannel = this.channelRepository.create({
      provider: 'whapi',
      external_id: channel.channel_id,
      start_at: channel.start_at,
      token: dto.token,
      channel_id: channel.channel_id,
      uptime: channel.uptime,
      version: channel.version,
      ip: channel.ip,
      device_id: channel.device_id,
      is_business: channel.is_business,
      api_version: channel.api_version,
      core_version: channel.core_version,
    });

    const savedWhapi = await this.channelRepository.save(whapiChannel);
    const tenantId = await this.ensureTenantId(savedWhapi);
    await this.upsertProviderMapping({
      tenant_id: tenantId,
      provider: 'whapi',
      external_id: savedWhapi.channel_id,
      channel_id: savedWhapi.channel_id,
    });

    this.logger.debug(
      `Whapi channel persisted: ${savedWhapi.channel_id}`,
      ChannelService.name,
    );

    return this.channelRepository.findOne({
      where: { id: savedWhapi.id },
    });
  }

  /**
   * Assigne (ou désassigne) un poste dédié à un channel.
   * poste_id = null → retour en mode pool (queue globale).
   */
  async assignPoste(channelId: string, posteId: string | null): Promise<WhapiChannel> {
    if (posteId !== null) {
      const poste = await this.posteRepository.findOne({ where: { id: posteId } });
      if (!poste) {
        throw new NotFoundException(`Poste introuvable : ${posteId}`);
      }
    }

    await this.channelRepository.update(
      { channel_id: channelId },
      { poste_id: posteId },
    );

    this.logger.log(
      posteId
        ? `Channel "${channelId}" assigné au poste "${posteId}" (mode dédié)`
        : `Channel "${channelId}" désassigné — retour en mode pool global`,
      ChannelService.name,
    );

    const updated = await this.channelRepository.findOne({
      where: { channel_id: channelId },
      relations: ['poste'],
    });
    if (!updated) {
      throw new NotFoundException(`Channel introuvable : ${channelId}`);
    }
    return updated;
  }

  /**
   * Retourne le poste_id dédié à ce channel, ou null si mode pool.
   * Appelé par le dispatcher à chaque message entrant — requête légère (SELECT poste_id uniquement).
   */
  async getDedicatedPosteId(channelId: string): Promise<string | null> {
    if (!channelId) return null;
    const result = await this.channelRepository
      .createQueryBuilder('c')
      .select('c.poste_id', 'poste_id')
      .where('c.channel_id = :channelId', { channelId })
      .getRawOne<{ poste_id: string | null }>();
    return result?.poste_id ?? null;
  }

  /**
   * Retourne les channel_id de tous les channels dédiés à un poste donné.
   * Utilisé pour filtrer les messages par canal dédié.
   */
  async getDedicatedChannelIdsForPoste(posteId: string): Promise<string[]> {
    const channels = await this.channelRepository.find({
      where: { poste_id: posteId },
      select: ['channel_id'],
    });
    return channels.map((c) => c.channel_id);
  }

  async findAll() {
    return await this.channelRepository.find({ relations: ['poste'] });
  }

  async findOne(id: string) {
    const channel = await this.channelRepository.findOne({
      where: { channel_id: id },
    });

    return channel;
  }

  async findByChannelId(channel_id: string) {
    return this.channelRepository.findOne({
      where: { channel_id },
    });
  }

  /**
   * Recherche un canal par son external_id (Page ID Facebook, Instagram account ID…).
   * Utilisé quand le webhook fournit l'external_id dans entry[0].id (Messenger, Instagram).
   */
  async findChannelByExternalId(provider: string, externalId: string): Promise<WhapiChannel | null> {
    return this.channelRepository.findOne({
      where: { provider, external_id: externalId },
    });
  }

  /**
   * Vérifie si un verify_token correspond à un canal existant pour ce provider.
   * Utilisé pour le challenge GET des webhooks Meta/Messenger/Instagram.
   */
  async hasMatchingVerifyToken(provider: string, token: string): Promise<boolean> {
    const channel = await this.channelRepository.findOne({
      where: { provider, verify_token: token },
    });
    return channel !== null;
  }

  async resolveTenantByProviderExternalId(
    provider: string,
    external_id: string,
  ): Promise<string | null> {
    const mapping = await this.providerChannelRepository.findOne({
      where: { provider, external_id },
    });
    return mapping?.tenant_id ?? null;
  }

  async ensureTenantId(channel: WhapiChannel): Promise<string> {
    if (channel.tenant_id) {
      return channel.tenant_id;
    }
    const tenantId = channel.id;
    await this.channelRepository.update(
      { id: channel.id },
      { tenant_id: tenantId },
    );
    return tenantId;
  }

  async upsertProviderMapping(params: {
    tenant_id: string;
    provider: string;
    external_id: string;
    channel_id?: string | null;
  }): Promise<void> {
    const existing = await this.providerChannelRepository.findOne({
      where: { provider: params.provider, external_id: params.external_id },
    });

    if (existing) {
      if (existing.tenant_id !== params.tenant_id) {
        this.logger.warn(
          `Provider mapping conflict for ${params.provider}:${params.external_id} existing_tenant=${existing.tenant_id} new_tenant=${params.tenant_id}`,
          ChannelService.name,
        );
        return;
      }

      if (params.channel_id && existing.channel_id !== params.channel_id) {
        existing.channel_id = params.channel_id;
        await this.providerChannelRepository.save(existing);
      }
      return;
    }

    const mapping = this.providerChannelRepository.create({
      tenant_id: params.tenant_id,
      provider: params.provider,
      external_id: params.external_id,
      channel_id: params.channel_id ?? null,
    });
    await this.providerChannelRepository.save(mapping);
  }

  async update(id: string, dto: UpdateChannelDto) {
    const channel = await this.channelRepository.findOne({ where: { id } });
    if (!channel) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }

    // Si un nouveau token est fourni pour un canal Meta/Messenger/Instagram, tenter l'échange long-lived
    const PROVIDERS_WITH_LONG_LIVED_TOKEN = ['meta', 'messenger', 'instagram'];
    if (dto.token) dto.token = dto.token.trim();

    if (
      PROVIDERS_WITH_LONG_LIVED_TOKEN.includes(channel.provider ?? '') &&
      dto.token &&
      dto.token !== channel.token
    ) {
      if (dto.permanent_token) {
        // Token System User permanent — pas d'échange, expiration fictive 2099
        (dto as UpdateChannelDto & { tokenExpiresAt?: Date }).tokenExpiresAt = new Date('2099-12-31');
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
          (dto as UpdateChannelDto & { tokenExpiresAt?: Date }).tokenExpiresAt = exchanged.expiresAt;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Impossible d'échanger le token à la mise à jour (token gardé tel quel): ${message}`,
            ChannelService.name,
          );
        }
      }

      // Pour Messenger/Instagram : tenter de dériver un PAT depuis le token obtenu
      if (['messenger', 'instagram'].includes(channel.provider ?? '')) {
        const pageId = channel.external_id ?? channel.channel_id;
        if (pageId) {
          const pat = await this.metaTokenService.getPageAccessToken(pageId, dto.token);
          if (pat) {
            this.logger.log(
              `Update canal ${id}: PAT dérivé pour la page ${pageId}`,
              ChannelService.name,
            );
            dto.token = pat;
            (dto as UpdateChannelDto & { tokenExpiresAt?: Date }).tokenExpiresAt = new Date('2099-12-31');
          } else {
            this.logger.warn(
              `Update canal ${id}: PAT non dérivé pour page ${pageId} — token stocké tel quel`,
              ChannelService.name,
            );
          }
        }
      }
    }

    Object.assign(channel, dto);
    return await this.channelRepository.save(channel);
  }

  async remove(id: string) {
    const result = await this.channelRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }
    return { deleted: true };
  }
}
