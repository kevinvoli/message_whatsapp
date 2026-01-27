import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhapiChannel } from './entities/channel.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
// import { WhapiUser } from './entities/whapi-user.entity';


@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhapiChannel
    ]),
  ],
  controllers: [ChannelController],
  providers: [ChannelService,CommunicationWhapiService],
  exports: [ChannelService],
})
export class ChannelModule {}
