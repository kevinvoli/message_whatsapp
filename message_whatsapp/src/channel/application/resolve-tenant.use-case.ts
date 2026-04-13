/**
 * TICKET-05-C — Use case : résolution du tenant_id à partir d'un external_id provider.
 *
 * Utilisé par les webhooks pour identifier à quel tenant appartient
 * un message entrant dont on connaît le provider et l'external_id.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ProviderChannel } from '../entities/provider-channel.entity';

@Injectable()
export class ResolveTenantUseCase {
  constructor(
    @InjectRepository(ProviderChannel)
    private readonly providerChannelRepository: Repository<ProviderChannel>,
  ) {}

  async execute(provider: string, externalId: string): Promise<string | null> {
    const mapping = await this.providerChannelRepository.findOne({
      where: { provider, external_id: externalId },
    });
    return mapping?.tenant_id ?? null;
  }
}
