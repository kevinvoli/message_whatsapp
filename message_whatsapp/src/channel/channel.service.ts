import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateChannelDto } from './dto/create-channel.dto';
// import { UpdateChannelDto } from './dto/update-channel.dto';
import { WhapiChannel } from './entities/channel.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
// import { WhapiUser } from './entities/whapi-user.entity';
// import { ChanneDatalDto } from './dto/channel-data.dto';

@Injectable()
export class ChannelService {
  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    // @InjectRepository(WhapiUser)
    // private readonly userRepository: Repository<WhapiUser>,

    private readonly connmunicationService: CommunicationWhapiService,
  ) {}

  async create(dto: CreateChannelDto) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const channel =
      await this.connmunicationService.getChannel(dto);

    if (!channel) {
      return;
    }
    const ifExisteChannel = await this.channelRepository.findOne({
      where: {
        token: dto.token,
      },
    });
    const newChannel = this.channelRepository.create(
      {
       start_at: channel.start_at,
       token: dto.token,
       channel_id: channel.channel_id,
       uptime:channel.uptime,
       version: channel.version,
       ip: channel.ip,
       device_id:channel.device_id,
       is_business:channel.is_business,
       api_version: channel.api_version,
       core_version: channel.core_version
      }
    ) 

    const newSave = await  this.channelRepository.save(newChannel)
    console.log("channel save",newSave);
    
    if (ifExisteChannel) {
      throw new NotFoundException('cette chaine a existe déja');
    }
    // const user = await this.userRepository.findOne()

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }


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
}
