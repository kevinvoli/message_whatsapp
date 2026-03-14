import { forwardRef, Module } from '@nestjs/common';
import { MessageAutoService } from './message-auto.service';
import { MessageAutoController } from './message-auto.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MessageAuto } from './entities/message-auto.entity';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { QueueService } from 'src/dispatcher/services/queue.service';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { SocketThrottleGuard } from 'src/whatsapp_message/guards/socket-throttle.guard';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { ChannelService } from 'src/channel/channel.service';
import { MetaTokenService } from 'src/channel/meta-token.service';
import { ContactService } from 'src/contact/contact.service';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ProviderChannel } from 'src/channel/entities/provider-channel.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { LoggingModule } from 'src/logging/logging.module';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { CallLogModule } from 'src/call-log/call_log.module';
import { AutoMessageScopeConfig } from './entities/auto-message-scope-config.entity';
import { AutoMessageScopeConfigService } from './auto-message-scope-config.service';
import { JorbsModule } from 'src/jorbs/jorbs.module';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      MessageAuto,
      AutoMessageScopeConfig,
      WhatsappMessage,
      WhatsappChat,
      WhatsappCommercial,
      WhatsappPoste,
      QueuePosition,
      WhapiChannel,
      ProviderChannel,
      Contact,
      WhatsappMedia,
    ]),
    forwardRef(() => WhatsappMessageModule),
    LoggingModule,
    CallLogModule,
    JorbsModule,
    NotificationModule,
  ],
  controllers: [MessageAutoController],
  providers: [
    MessageAutoService,
    AutoMessageScopeConfigService,
    WhatsappChatService,
    WhatsappCommercialService,
    WhatsappPosteService,
    QueueService,
    DispatcherService,
    CommunicationWhapiService,
    CommunicationMetaService,
    OutboundRouterService,
    SocketThrottleGuard,
    ChannelService,
    MetaTokenService,
    ContactService,
  ],
})
export class MessageAutoModule {}
