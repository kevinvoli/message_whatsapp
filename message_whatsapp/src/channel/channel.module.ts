import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { MetaTokenService } from './meta-token.service';
import { ChannelProviderRegistry } from './domain/channel-provider.registry';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhapiChannel } from './entities/channel.entity';
import { ProviderChannel } from './entities/provider-channel.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { CommunicationTelegramService } from 'src/communication_whapi/communication_telegram.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { LoggingModule } from 'src/logging/logging.module';
import { JorbsModule } from 'src/jorbs/jorbs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhapiChannel, ProviderChannel, WhatsappChat, WhatsappPoste]),
    LoggingModule,
    JorbsModule,
  ],
  controllers: [ChannelController],
  providers: [ChannelService, CommunicationWhapiService, CommunicationTelegramService, MetaTokenService, ChannelProviderRegistry],
  exports: [ChannelService, MetaTokenService, ChannelProviderRegistry],
})
export class ChannelModule {}
