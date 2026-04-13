import {
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { UpdateChannelDto } from './dto/update-channel.dto';
import { WhapiChannel } from './entities/channel.entity';
import { ProviderChannel } from './entities/provider-channel.entity';
import { AppLogger } from 'src/logging/app-logger.service';
import { ChannelProviderRegistry } from './domain/channel-provider.registry';
import { ResolveTenantUseCase } from './application/resolve-tenant.use-case';

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
  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    @InjectRepository(ProviderChannel)
    private readonly providerChannelRepository: Repository<ProviderChannel>,
    private readonly logger: AppLogger,
    private readonly providerRegistry: ChannelProviderRegistry,
    private readonly resolveTenantUseCase: ResolveTenantUseCase,
  ) {}

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
    const result = await this.channelRepository
      .createQueryBuilder('c')
      .select('c.poste_id', 'poste_id')
      .where('c.channel_id = :channelId', { channelId })
      .getRawOne<{ poste_id: string | null }>();
    return result?.poste_id ?? null;
  }

  /**
   * Retourne les channel_id de tous les channels dédiés à un poste donné.
   */
  async getDedicatedChannelIdsForPoste(posteId: string): Promise<string[]> {
    const channels = await this.channelRepository.find({
      where: { poste_id: posteId },
      select: ['channel_id'],
    });
    return channels.map((c) => c.channel_id);
  }

  async findAll() {
    return this.channelRepository.find({ relations: ['poste'] });
  }

  async findOne(id: string) {
    return this.channelRepository.findOne({ where: { channel_id: id } });
  }

  async findByChannelId(channel_id: string) {
    return this.channelRepository.findOne({ where: { channel_id } });
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
    if (strategy) {
      return strategy.update(channel, dto);
    }

    // Fallback conservateur pour les providers non encore enregistrés
    Object.assign(channel, dto);
    return this.channelRepository.save(channel);
  }

  async remove(id: string) {
    const result = await this.channelRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }
    return { deleted: true };
  }
}
