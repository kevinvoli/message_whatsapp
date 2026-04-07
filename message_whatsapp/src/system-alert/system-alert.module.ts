import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SystemAlertService } from './system-alert.service';
import { SystemAlertController } from './system-alert.controller';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ProviderChannel } from 'src/channel/entities/provider-channel.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { SystemAlertConfig } from './entities/system-alert-config.entity';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { CommunicationMessengerService } from 'src/communication_whapi/communication_messenger.service';
import { CommunicationInstagramService } from 'src/communication_whapi/communication_instagram.service';
import { CommunicationTelegramService } from 'src/communication_whapi/communication_telegram.service';
import { ChannelService } from 'src/channel/channel.service';
import { MetaTokenService } from 'src/channel/meta-token.service';
import { LoggingModule } from 'src/logging/logging.module';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    NotificationModule,
    TypeOrmModule.forFeature([WhapiChannel, ProviderChannel, WhatsappChat, WhatsappPoste, SystemAlertConfig]),
  ],
  providers: [
    SystemAlertService,
    OutboundRouterService,
    CommunicationWhapiService,
    CommunicationMetaService,
    CommunicationMessengerService,
    CommunicationInstagramService,
    CommunicationTelegramService,
    ChannelService,
    MetaTokenService,
  ],
  controllers: [SystemAlertController],
  exports: [SystemAlertService],
})
export class SystemAlertModule {}
