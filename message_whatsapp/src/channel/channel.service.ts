import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { WhapiChannel } from './entities/channel.entity';
import { ProviderChannel } from './entities/provider-channel.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class ChannelService {
  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    @InjectRepository(ProviderChannel)
    private readonly providerChannelRepository: Repository<ProviderChannel>,
    private readonly connmunicationService: CommunicationWhapiService,
    private readonly logger: AppLogger,
  ) {}

  async create(dto: CreateChannelDto) {
    const provider = dto.provider ?? 'whapi';

    const existingChannel = await this.channelRepository.findOne({
      where: {
        token: dto.token,
      },
    });

    if (existingChannel) {
      throw new ConflictException('Ce channel existe deja');
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

      const metaChannel = this.channelRepository.create({
        provider: 'meta',
        external_id: externalId,
        start_at: nowEpoch,
        token: dto.token,
        channel_id: channelId,
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

  async findAll() {
    return await this.channelRepository.find();
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
    await this.channelRepository.update({ id: channel.id }, { tenant_id: tenantId });
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
