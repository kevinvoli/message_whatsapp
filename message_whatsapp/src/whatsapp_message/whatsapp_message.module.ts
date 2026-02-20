import { forwardRef, Module } from '@nestjs/common';
import { WhatsappMessageService } from './whatsapp_message.service';
import { WhatsappMessageController } from './whatsapp_message.controller';
import { WhatsappMessageGateway } from './whatsapp_message.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { WhatsappMessage } from './entities/whatsapp_message.entity';
import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappChatModule } from 'src/whatsapp_chat/whatsapp_chat.module';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { DispatcherModule } from 'src/dispatcher/dispatcher.module';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { FirstResponseTimeoutJob } from 'src/jorbs/first-response-timeout.job';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ProviderChannel } from 'src/channel/entities/provider-channel.entity';
import { ChannelService } from 'src/channel/channel.service';
import { ContactService } from 'src/contact/contact.service';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { MessageAutoService } from 'src/message-auto/message-auto.service';
import { MessageAuto } from 'src/message-auto/entities/message-auto.entity';
import { LoggingModule } from 'src/logging/logging.module';
import { SocketThrottleGuard } from './guards/socket-throttle.guard';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { CallLogModule } from 'src/call-log/call_log.module';

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
      WhatsappMessage,
      WhatsappChat,
      WhatsappMessageContent,
      WhatsappCommercial,
      QueuePosition,
      WhapiChannel,
      ProviderChannel,
      Contact,
      WhatsappPoste,
      MessageAuto,
      WhatsappMedia,
    ]),
    WhatsappChatModule,
    forwardRef(() => DispatcherModule),
    LoggingModule,
    CallLogModule,
  ],
  controllers: [WhatsappMessageController],
  providers: [
    WhatsappChatService,
    WhatsappMessageGateway,
    WhatsappMessageService,
    WhatsappCommercialService,
    CommunicationWhapiService,
    CommunicationMetaService,
    OutboundRouterService,
    FirstResponseTimeoutJob,
    ChannelService,
    ContactService,
    WhatsappPosteService,
    MessageAutoService,
    SocketThrottleGuard,
  ],
  exports: [
    WhatsappMessageGateway,
    WhatsappMessageService,
    FirstResponseTimeoutJob,
  ],
})
export class WhatsappMessageModule {}
