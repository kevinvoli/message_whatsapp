import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { WhapiChannel } from './entities/channel.entity';
import { ProviderChannel } from './entities/provider-channel.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { AppLogger } from 'src/logging/app-logger.service';
// import { WhapiUser } from './entities/whapi-user.entity';
// import { ChanneDatalDto } from './dto/channel-data.dto';

@Injectable()
export class ChannelService {
  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    @InjectRepository(ProviderChannel)
    private readonly providerChannelRepository: Repository<ProviderChannel>,
    // @InjectRepository(WhapiUser)
    // private readonly userRepository: Repository<WhapiUser>,

    private readonly connmunicationService: CommunicationWhapiService,
    private readonly logger: AppLogger,
  ) {}

  async create(dto: CreateChannelDto) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const channel =
      await this.connmunicationService.getChannel(dto);

    if (!channel) {
      return;
    }
    const existingChannel = await this.channelRepository.findOne({
      where: {
        token: dto.token,
      },
    });

    if (existingChannel) {
      throw new ConflictException('Ce channel existe déjà');
    }

    const newChannel = this.channelRepository.create({
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

    const newSave = await this.channelRepository.save(newChannel);
    this.logger.debug(`Channel persisted: ${newSave.channel_id}`, ChannelService.name);

    return newSave;
  }

  async findAll() {
    return await this.channelRepository.find();
  }

  async findOne(id: string) {
    const channel = await this.channelRepository.findOne({
      where: { channel_id:id },
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
