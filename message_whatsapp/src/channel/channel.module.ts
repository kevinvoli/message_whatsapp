import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { MetaTokenService } from './meta-token.service';
import { MetaTokenSchedulerService } from './meta-token-scheduler.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhapiChannel } from './entities/channel.entity';
import { ProviderChannel } from './entities/provider-channel.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { LoggingModule } from 'src/logging/logging.module';
// import { WhapiUser } from './entities/whapi-user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhapiChannel, ProviderChannel, WhatsappChat]),
    LoggingModule,
  ],
  controllers: [ChannelController],
  providers: [ChannelService, CommunicationWhapiService, MetaTokenService, MetaTokenSchedulerService],
  exports: [ChannelService, MetaTokenService],
})
export class ChannelModule {}
