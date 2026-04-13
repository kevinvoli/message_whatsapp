/**
 * TICKET-05-B — Helper de persistance partagé entre les stratégies provider.
 *
 * Encapsule les opérations TypeORM communes (save, ensureTenantId, upsertProviderMapping)
 * pour éviter de dupliquer les injections de repos dans chaque stratégie.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhapiChannel } from '../entities/channel.entity';
import { ProviderChannel } from '../entities/provider-channel.entity';
import { AppLogger } from 'src/logging/app-logger.service';

export interface ProviderMappingParams {
  tenant_id: string;
  provider: string;
  external_id: string;
  channel_id?: string | null;
}

@Injectable()
export class ChannelPersistenceHelper {
  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
    @InjectRepository(ProviderChannel)
    private readonly providerChannelRepo: Repository<ProviderChannel>,
    private readonly logger: AppLogger,
  ) {}

  create(partial: Partial<WhapiChannel>): WhapiChannel {
    return this.channelRepo.create(partial);
  }

  async save(channel: WhapiChannel): Promise<WhapiChannel> {
    return this.channelRepo.save(channel);
  }

  async findById(id: string): Promise<WhapiChannel | null> {
    return this.channelRepo.findOne({ where: { id } });
  }

  /**
   * Garantit que le channel a un tenant_id (= son propre id si non défini).
   * Mutate la DB et retourne le tenant_id effectif.
   */
  async ensureTenantId(channel: WhapiChannel): Promise<string> {
    if (channel.tenant_id) return channel.tenant_id;
    const tenantId = channel.id;
    await this.channelRepo.update({ id: channel.id }, { tenant_id: tenantId });
    return tenantId;
  }

  /**
   * Crée ou met à jour le mapping provider_channel pour ce canal.
   * Idempotent : ignore les conflits si l'entrée existe déjà avec le même tenant.
   */
  async upsertProviderMapping(params: ProviderMappingParams): Promise<void> {
    const existing = await this.providerChannelRepo.findOne({
      where: { provider: params.provider, external_id: params.external_id },
    });

    if (existing) {
      if (existing.tenant_id !== params.tenant_id) {
        this.logger.warn(
          `Provider mapping conflict for ${params.provider}:${params.external_id} existing_tenant=${existing.tenant_id} new_tenant=${params.tenant_id}`,
          ChannelPersistenceHelper.name,
        );
        return;
      }
      if (params.channel_id && existing.channel_id !== params.channel_id) {
        existing.channel_id = params.channel_id;
        await this.providerChannelRepo.save(existing);
      }
      return;
    }

    const mapping = this.providerChannelRepo.create({
      tenant_id: params.tenant_id,
      provider: params.provider,
      external_id: params.external_id,
      channel_id: params.channel_id ?? null,
    });
    await this.providerChannelRepo.save(mapping);
  }
}
