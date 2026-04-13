/**
 * TICKET-05-B — Stratégie provider Whapi.
 *
 * Crée et met à jour un canal WhatsApp via l'API Whapi.
 * Extrait de `ChannelService.create()` branche `provider === 'whapi'`.
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from 'src/logging/app-logger.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { ChannelProviderStrategy } from '../domain/channel-provider-strategy.interface';
import { ChannelProviderRegistry } from '../domain/channel-provider.registry';
import { ChannelPersistenceHelper } from '../infrastructure/channel-persistence.helper';
import { CreateChannelDto } from '../dto/create-channel.dto';
import { UpdateChannelDto } from '../dto/update-channel.dto';
import { WhapiChannel } from '../entities/channel.entity';

@Injectable()
export class WhapiChannelProviderService implements ChannelProviderStrategy, OnModuleInit {
  readonly provider = 'whapi';

  constructor(
    private readonly helper: ChannelPersistenceHelper,
    private readonly communicationService: CommunicationWhapiService,
    private readonly logger: AppLogger,
    private readonly registry: ChannelProviderRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async create(dto: CreateChannelDto): Promise<WhapiChannel> {
    const channel = await this.communicationService.getChannel(dto);
    if (!channel) {
      throw new Error('Whapi: canal introuvable via getChannel');
    }

    const whapiChannel = this.helper.create({
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

    const saved = await this.helper.save(whapiChannel);
    const tenantId = await this.helper.ensureTenantId(saved);

    await this.helper.upsertProviderMapping({
      tenant_id: tenantId,
      provider: 'whapi',
      external_id: saved.channel_id,
      channel_id: saved.channel_id,
    });

    this.logger.debug(
      `Whapi channel persisted: ${saved.channel_id}`,
      WhapiChannelProviderService.name,
    );

    return this.helper.findById(saved.id) as Promise<WhapiChannel>;
  }

  async update(channel: WhapiChannel, dto: UpdateChannelDto): Promise<WhapiChannel> {
    // Whapi n'a pas de logique de token rotatif — mise à jour directe
    Object.assign(channel, dto);
    return this.helper.save(channel);
  }
}
