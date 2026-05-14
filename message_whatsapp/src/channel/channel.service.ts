import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import axios, { AxiosError } from 'axios';
import Redis from 'ioredis';

import { UpdateChannelDto } from './dto/update-channel.dto';
import { WhapiChannel } from './entities/channel.entity';
import { ProviderChannel } from './entities/provider-channel.entity';
import { AppLogger } from 'src/logging/app-logger.service';
import { ChannelProviderRegistry } from './domain/channel-provider.registry';
import { ResolveTenantUseCase } from './application/resolve-tenant.use-case';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import type { SystemConfigService } from 'src/system-config/system-config.service';

/**
 * TICKET-05-C-CLEANUP — `ChannelService` ne contient plus de délégations pures.
 *
 * Les use cases sont appelés directement par leurs consommateurs :
 *   - CreateChannelUseCase     → ChannelController.create()
 *   - AssignChannelPosteUseCase → ChannelController.assignPoste()
 *   - ResolveTenantUseCase     → appelé directement là où nécessaire
 *
 * `ChannelService` conserve uniquement :
 *   - Les requêtes de lecture légères (findAll, findOne, findByChannelId…)
 *   - update() / remove()
 *   - onModuleInit() de surveillance des canaux non sécurisés
 *   - ensureTenantId() / upsertProviderMapping() appelés par d'autres services
 */
@Injectable()
export class ChannelService implements OnModuleInit {
  private systemConfigService: SystemConfigService | null = null;

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    @InjectRepository(ProviderChannel)
    private readonly providerChannelRepository: Repository<ProviderChannel>,
    private readonly logger: AppLogger,
    private readonly providerRegistry: ChannelProviderRegistry,
    private readonly resolveTenantUseCase: ResolveTenantUseCase,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    private readonly moduleRef: ModuleRef,
  ) {}

  private getSystemConfigService(): SystemConfigService {
    if (!this.systemConfigService) {
      this.systemConfigService = this.moduleRef.get<SystemConfigService>('SystemConfigService', { strict: false });
    }
    return this.systemConfigService!;
  }

  private async cachedGet<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
    if (this.redis) {
      const raw = await this.redis.get(key);
      if (raw !== null) return JSON.parse(raw) as T;
      const value = await loader();
      await this.redis.setex(key, ttl, JSON.stringify(value));
      return value;
    }
    return loader();
  }

  private async invalidateChannelKeys(channelId: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.del(
      `channel:id:${channelId}`,
      `channel:dedicated:${channelId}`,
      `channel:is_dedicated:${channelId}`,
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      const unsecured = await this.channelRepository.find({
        where: [
          { provider: 'messenger', meta_app_secret: IsNull() },
          { provider: 'meta', meta_app_secret: IsNull() },
        ],
        select: ['channel_id', 'provider', 'external_id'],
      });
      for (const ch of unsecured) {
        this.logger.error(
          `CHANNEL_NO_SECRET provider=${ch.provider} channel_id=${ch.channel_id ?? 'n/a'} external_id=${ch.external_id ?? 'n/a'} — les webhooks retourneront 401 en production`,
          undefined,
          ChannelService.name,
        );
      }
    } catch {
      // best-effort : ne pas bloquer le démarrage si la DB n'est pas encore disponible
    }
  }

  async resolveTenantByProviderExternalId(
    provider: string,
    external_id: string,
  ): Promise<string | null> {
    return this.resolveTenantUseCase.execute(provider, external_id);
  }

  // ── Requêtes de lecture ────────────────────────────────────────────────────

  /**
   * Retourne le poste_id dédié à ce channel, ou null si mode pool.
   * Appelé par le dispatcher à chaque message entrant — requête légère.
   */
  async getDedicatedPosteId(channelId: string): Promise<string | null> {
    if (!channelId) return null;
    return this.cachedGet<string | null>(`channel:dedicated:${channelId}`, 60, async () => {
      const result = await this.channelRepository
        .createQueryBuilder('c')
        .select('c.poste_id', 'poste_id')
        .where('c.channel_id = :channelId', { channelId })
        .getRawOne<{ poste_id: string | null }>();
      return result?.poste_id ?? null;
    });
  }

  /**
   * Retourne les channel_id de tous les channels dédiés à un poste donné.
   */
  async getDedicatedChannelIdsForPoste(posteId: string): Promise<string[]> {
    return this.cachedGet<string[]>(`poste:dedicated_channels:${posteId}`, 60, async () => {
      const channels = await this.channelRepository.find({
        where: { poste_id: posteId },
        select: ['channel_id'],
      });
      return channels.map((c) => c.channel_id);
    });
  }

  /**
   * Retourne true si le channel identifié par channelId est dédié à un poste
   * (poste_id IS NOT NULL). Utilisé par le dispatcher pour le routage.
   */
  async isChannelDedicated(channelId: string): Promise<boolean> {
    if (!channelId) return false;
    return this.cachedGet<boolean>(`channel:is_dedicated:${channelId}`, 60, async () => {
      const ch = await this.channelRepository.findOne({
        where: { channel_id: channelId },
        select: ['channel_id', 'poste_id'],
      });
      return !!ch?.poste_id;
    });
  }

  /**
   * Retourne true si les conversations de ce channel ne doivent jamais passer
   * en lecture seule (flag no_read_only activé par l'admin).
   */
  async isReadOnlyBlocked(channelId: string): Promise<boolean> {
    if (!channelId) return false;
    const ch = await this.channelRepository.findOne({
      where: { channel_id: channelId },
      select: ['channel_id', 'no_read_only'],
    });
    return !!ch?.no_read_only;
  }

  /**
   * Retourne true si les conversations de ce channel ne doivent jamais être
   * fermées (flag no_close activé par l'admin).
   */
  async isCloseBlocked(channelId: string): Promise<boolean> {
    if (!channelId) return false;
    const ch = await this.channelRepository.findOne({
      where: { channel_id: channelId },
      select: ['channel_id', 'no_close'],
    });
    return !!ch?.no_close;
  }

  /**
   * Retourne true si la fermeture automatique doit être ignorée pour ce canal.
   * Deux conditions protègent un canal :
   *   1. flag no_close activé par l'admin
   *   2. canal dédié à un poste (poste_id IS NOT NULL) — le commercial dédié
   *      doit pouvoir répondre sans limite de 24h
   */
  async shouldSkipAutoClose(channelId: string): Promise<boolean> {
    if (!channelId) return false;
    const ch = await this.channelRepository.findOne({
      where: { channel_id: channelId },
      select: ['channel_id', 'no_close', 'poste_id'],
    });
    return !!ch?.no_close || !!ch?.poste_id;
  }

  /**
   * Retourne la limite effective de messages avant read_only pour ce canal.
   * Priorité : surcharge canal → config globale → 0 (désactivé).
   *
   * 0 = désactivé (pas de passage automatique en read_only basé sur ce compteur).
   * N = passer en read_only après N messages sortants.
   */
  async getEffectiveMessageLimit(channelId: string): Promise<number> {
    if (!channelId) return 0;
    const ch = await this.channelRepository.findOne({
      where: { channel_id: channelId },
      select: ['channel_id', 'maxMessagesBeforeReadonly'],
    });
    if (ch?.maxMessagesBeforeReadonly !== null && ch?.maxMessagesBeforeReadonly !== undefined) {
      return ch.maxMessagesBeforeReadonly;
    }
    const global = await this.getSystemConfigService().get('MAX_MESSAGES_BEFORE_READONLY');
    return global ? parseInt(global, 10) || 0 : 0;
  }

  async findAll() {
    return this.channelRepository.find({ relations: ['poste'] });
  }

  async findOne(id: string) {
    return this.cachedGet<WhapiChannel | null>(`channel:id:${id}`, 120, () =>
      this.channelRepository.findOne({ where: { channel_id: id } }),
    );
  }

  async findByChannelId(channel_id: string) {
    return this.cachedGet<WhapiChannel | null>(`channel:id:${channel_id}`, 120, () =>
      this.channelRepository.findOne({ where: { channel_id } }),
    );
  }

  /**
   * Recherche un canal par son external_id (Page ID Facebook, Instagram account ID…).
   */
  async findChannelByExternalId(provider: string, externalId: string): Promise<WhapiChannel | null> {
    return this.channelRepository.findOne({
      where: { provider, external_id: externalId },
    });
  }

  /**
   * Vérifie si un verify_token correspond à un canal existant pour ce provider.
   */
  async hasMatchingVerifyToken(provider: string, token: string): Promise<boolean> {
    const channel = await this.channelRepository.findOne({
      where: { provider, verify_token: token },
    });
    return channel !== null;
  }

  // ── Opérations sur le tenant (appelées par providers + webhooks) ───────────

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

  // ── Mutation / suppression ─────────────────────────────────────────────────

  async update(id: string, dto: UpdateChannelDto) {
    const channel = await this.channelRepository.findOne({ where: { id } });
    if (!channel) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }

    const strategy = this.providerRegistry.get(channel.provider ?? '');
    let result: WhapiChannel;
    if (strategy) {
      result = await strategy.update(channel, dto);
    } else {
      Object.assign(channel, dto);
      result = await this.channelRepository.save(channel);
    }

    if (channel.channel_id) {
      await this.invalidateChannelKeys(channel.channel_id);
    }
    if (channel.poste_id && this.redis) {
      await this.redis.del(`poste:dedicated_channels:${channel.poste_id}`);
    }

    return result;
  }

  async remove(id: string) {
    const channel = await this.channelRepository.findOne({ where: { id }, select: ['channel_id', 'poste_id'] });
    const result = await this.channelRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }

    if (channel?.channel_id) {
      await this.invalidateChannelKeys(channel.channel_id);
    }
    if (channel?.poste_id && this.redis) {
      await this.redis.del(`poste:dedicated_channels:${channel.poste_id}`);
    }

    return { deleted: true };
  }

  // ── Récupération automatique du WABA ID depuis l'API Meta ─────────────────

  /**
   * Interroge l'API Graph Facebook pour récupérer le `whatsapp_business_account_id`
   * associé au `phone_number_id` du canal, puis le persiste dans `waba_id`.
   *
   * Réservé aux canaux de type `provider = 'meta'`.
   */
  async fetchAndSaveWabaId(channelUuid: string): Promise<WhapiChannel> {
    const channel = await this.channelRepository.findOne({ where: { id: channelUuid } });

    if (!channel) {
      throw new NotFoundException(`Canal ${channelUuid} introuvable`);
    }

    if (channel.provider !== 'meta') {
      throw new BadRequestException(
        `Le canal ${channelUuid} (provider: ${channel.provider ?? 'inconnu'}) n'est pas de type Meta`,
      );
    }

    if (!channel.channel_id) {
      throw new BadRequestException(
        `Le canal ${channelUuid} n'a pas de phone_number_id (channel_id) configuré`,
      );
    }

    const META_API_VERSION = process.env.META_API_VERSION ?? 'v20.0';
    const url = `https://graph.facebook.com/${META_API_VERSION}/${channel.channel_id}`;

    try {
      const response = await axios.get<{
        whatsapp_business_account_id?: string;
        id: string;
      }>(url, {
        params: { fields: 'whatsapp_business_account_id' },
        headers: { Authorization: `Bearer ${channel.token}` },
      });

      const wabaId = response.data.whatsapp_business_account_id;

      if (!wabaId) {
        throw new BadRequestException('WABA ID introuvable dans la réponse Meta');
      }

      channel.waba_id = wabaId;
      await this.channelRepository.save(channel);

      this.logger.log(
        `WABA ID ${wabaId} récupéré et enregistré pour le canal ${channelUuid}`,
        ChannelService.name,
      );

      return channel;
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      if (err instanceof AxiosError) {
        const metaMessage = (err.response?.data as { error?: { message?: string } } | undefined)
          ?.error?.message;
        const msg = metaMessage ?? err.message ?? "Impossible de joindre l'API Meta";
        this.logger.error(
          `Échec récupération WABA ID pour canal ${channelUuid}: ${msg}`,
          ChannelService.name,
        );
        throw new BadRequestException(`Meta: ${msg}`);
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Erreur inattendue fetchAndSaveWabaId canal ${channelUuid}: ${msg}`,
        ChannelService.name,
      );
      throw new BadRequestException(`Erreur lors de la récupération du WABA ID: ${msg}`);
    }
  }
}
