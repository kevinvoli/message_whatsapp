import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SendTextMessageHandler } from './application/commands/send-text-message.handler';
import { GetMessagesForChatHandler } from './application/queries/get-messages-for-chat.handler';
import { WhatsappMessageService } from './whatsapp_message.service';
import { WhatsappMessageController } from './whatsapp_message.controller';
import { WhatsappMessageGateway } from './whatsapp_message.gateway';
import { MessageQueryService } from './services/message-query.service';
import { MessageStatusService } from './services/message-status.service';
import { InboundPersistenceService } from './services/inbound-persistence.service';
import { OutboundMessageService } from './services/outbound-message.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageTypeOrmRepository } from 'src/infrastructure/persistence/typeorm/message.typeorm-repository';
import { ConversationTypeOrmRepository } from 'src/infrastructure/persistence/typeorm/conversation.typeorm-repository';
import { CommercialTypeOrmRepository } from 'src/infrastructure/persistence/typeorm/commercial.typeorm-repository';
import { MediaTypeOrmRepository } from 'src/infrastructure/persistence/typeorm/media.typeorm-repository';
import {
  MESSAGE_REPOSITORY,
  CONVERSATION_REPOSITORY,
  COMMERCIAL_REPOSITORY,
  MEDIA_REPOSITORY,
} from 'src/domain/repositories/repository.tokens';
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
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { CallLogModule } from 'src/call-log/call_log.module';
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
    CqrsModule,
    WhatsappChatModule,
    DispatcherModule,
    LoggingModule,
    CallLogModule,
    JorbsModule,
    NotificationModule,
  ],
  controllers: [WhatsappMessageController],
  providers: [
    { provide: MESSAGE_REPOSITORY, useClass: MessageTypeOrmRepository },
    { provide: CONVERSATION_REPOSITORY, useClass: ConversationTypeOrmRepository },
    { provide: COMMERCIAL_REPOSITORY, useClass: CommercialTypeOrmRepository },
    { provide: MEDIA_REPOSITORY, useClass: MediaTypeOrmRepository },
    WhatsappChatService,
    WhatsappMessageGateway,
    WhatsappMessageService,
    MessageQueryService,
    MessageStatusService,
    InboundPersistenceService,
    OutboundMessageService,
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
    SendTextMessageHandler,
    GetMessagesForChatHandler,
  ],
  exports: [
    WhatsappMessageGateway,
    WhatsappMessageService,
    MessageQueryService,
    MessageStatusService,
    InboundPersistenceService,
    OutboundMessageService,
    FirstResponseTimeoutJob,
  ],
})
export class WhatsappMessageModule {}
