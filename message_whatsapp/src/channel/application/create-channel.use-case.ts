/**
 * TICKET-05-C — Use case : création d'un canal.
 *
 * Responsabilités :
 *  1. Valider l'unicité du token et du channel_id (cross-provider).
 *  2. Déléguer la persistance + logique provider à la stratégie enregistrée.
 *
 * `ChannelService` se contente de déléguer ici sans connaître les détails.
 */
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateChannelDto } from '../dto/create-channel.dto';
import { WhapiChannel } from '../entities/channel.entity';
import { ChannelProviderRegistry } from '../domain/channel-provider.registry';

@Injectable()
export class CreateChannelUseCase {
  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    private readonly providerRegistry: ChannelProviderRegistry,
  ) {}

  async execute(dto: CreateChannelDto): Promise<WhapiChannel | null> {
    const provider = dto.provider ?? 'whapi';

    // ── Validations cross-provider ──────────────────────────────────────────
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

    // ── Délégation à la stratégie provider ─────────────────────────────────
    const strategy = this.providerRegistry.get(provider);
    if (!strategy) {
      throw new BadRequestException(`Provider non supporté : ${provider}`);
    }

    return strategy.create(dto);
  }
}
