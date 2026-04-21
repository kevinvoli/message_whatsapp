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
import { CommunicationMessengerService } from 'src/communication_whapi/communication_messenger.service';
import { CommunicationInstagramService } from 'src/communication_whapi/communication_instagram.service';
import { CommunicationTelegramService } from 'src/communication_whapi/communication_telegram.service';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { DispatcherModule } from 'src/dispatcher/dispatcher.module';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { FirstResponseTimeoutJob } from 'src/jorbs/first-response-timeout.job';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ProviderChannel } from 'src/channel/entities/provider-channel.entity';
import { ChannelService } from 'src/channel/channel.service';
import { MetaTokenService } from 'src/channel/meta-token.service';
import { ContactService } from 'src/contact/contact.service';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { LoggingModule } from 'src/logging/logging.module';
import { SocketThrottleGuard } from './guards/socket-throttle.guard';
import { SocketAuthService } from './services/socket-auth.service';
import { SocketConversationQueryService } from './services/socket-conversation-query.service';
import { FlowbotOutboundListener } from './listeners/flowbot-outbound.listener';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { RealtimeServerService } from 'src/realtime/realtime-server.service';
import { ConversationPublisher } from 'src/realtime/publishers/conversation.publisher';
import { QueuePublisher } from 'src/realtime/publishers/queue.publisher';
import { AgentConnectionService } from 'src/realtime/connections/agent-connection.service';
import { ChannelProviderRegistry } from 'src/channel/domain/channel-provider.registry';
import { ResolveTenantUseCase } from 'src/channel/application/resolve-tenant.use-case';
import { CallLogModule } from 'src/call-log/call_log.module';
import { JorbsModule } from 'src/jorbs/jorbs.module';
import { NotificationModule } from 'src/notification/notification.module';
import { SystemAlertModule } from 'src/system-alert/system-alert.module';
import { WindowModule } from 'src/window/window.module';
import { WindowPublisher } from 'src/realtime/publishers/window.publisher';
import { ConversationCapacityModule } from 'src/conversation-capacity/conversation-capacity.module';

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
      WhatsappMedia,
    ]),
    WhatsappChatModule,
    forwardRef(() => DispatcherModule),
    LoggingModule,
    CallLogModule,
    JorbsModule,
    NotificationModule,
    SystemAlertModule,
    WindowModule,
    ConversationCapacityModule,
  ],
  controllers: [WhatsappMessageController],
  providers: [
    WhatsappChatService,
    WhatsappMessageGateway,
    WhatsappMessageService,
    WhatsappCommercialService,
    CommunicationWhapiService,
    CommunicationMetaService,
    CommunicationMessengerService,
    CommunicationInstagramService,
    CommunicationTelegramService,
    OutboundRouterService,
    FirstResponseTimeoutJob,
    ChannelService,
    MetaTokenService,
    ContactService,
    WhatsappPosteService,
    SocketThrottleGuard,
    SocketAuthService,
    SocketConversationQueryService,
    RealtimeServerService,
    ConversationPublisher,
    QueuePublisher,
    WindowPublisher,
    AgentConnectionService,
    ChannelProviderRegistry,
    ResolveTenantUseCase,
    FlowbotOutboundListener,
  ],
  exports: [
    WhatsappMessageGateway,
    WhatsappMessageService,
    FirstResponseTimeoutJob,
    ConversationPublisher,
    QueuePublisher,
    RealtimeServerService,
    AgentConnectionService,
  ],
})
export class WhatsappMessageModule {}
