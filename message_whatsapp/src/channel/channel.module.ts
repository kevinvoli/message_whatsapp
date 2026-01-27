import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhapiChannel } from './entities/channel.entity';
import { CommunicationWhapiModule } from 'src/communication_whapi/communication_whapi.module';
import { WhapiUser } from './entities/whapi-user.entity';


@Module({imports: [
    TypeOrmModule.forFeature([
      WhapiChannel,WhapiUser
    ]),
    CommunicationWhapiModule,
  ],
  controllers: [ChannelController],
  providers: [ChannelService],
  exports: [ChannelService],
})
export class ChannelModule {}
