import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelGateway } from './channel.gateway';

@Module({
  providers: [ChannelGateway, ChannelService],
})
export class ChannelModule {}
