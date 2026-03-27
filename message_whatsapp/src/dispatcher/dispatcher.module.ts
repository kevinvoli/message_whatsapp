import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssignConversationHandler } from './application/commands/assign-conversation.handler';
import { GetDispatchSnapshotHandler } from './application/queries/get-dispatch-snapshot.handler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatcherService } from './dispatcher.service';
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
import { QueueService } from './services/queue.service';
import { MessageQueryService } from 'src/whatsapp_message/services/message-query.service';
import { MessageStatusService } from 'src/whatsapp_message/services/message-status.service';
import { InboundPersistenceService } from 'src/whatsapp_message/services/inbound-persistence.service';
import { OutboundMessageService } from 'src/whatsapp_message/services/outbound-message.service';
import { QueuePosition } from './entities/queue-position.entity';
import { DispatchSettings } from './entities/dispatch-settings.entity';
import { DispatchSettingsAudit } from './entities/dispatch-settings-audit.entity';
import { JorbsModule } from 'src/jorbs/jorbs.module';
import { CronConfig } from 'src/jorbs/entities/cron-config.entity';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { CommunicationMessengerService } from 'src/communication_whapi/communication_messenger.service';
import { CommunicationInstagramService } from 'src/communication_whapi/communication_instagram.service';
import { CommunicationTelegramService } from 'src/communication_whapi/communication_telegram.service';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ProviderChannel } from 'src/channel/entities/provider-channel.entity';
import { ChannelService } from 'src/channel/channel.service';
import { MetaTokenService } from 'src/channel/meta-token.service';
import { ContactService } from 'src/contact/contact.service';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { LoggingModule } from 'src/logging/logging.module';
import { DispatcherController } from './dispatcher.controller';
import { ConversationController } from './conversation.controller';
import { OfflineReinjectionJob } from 'src/jorbs/offline-reinjection.job';
import { DispatchSettingsService } from './services/dispatch-settings.service';
import { ReadOnlyEnforcementJob } from 'src/jorbs/read-only-enforcement.job';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { CallLogModule } from 'src/call-log/call_log.module';
import { NotificationModule } from 'src/notification/notification.module';
import { TagsModule } from 'src/tags/tags.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QueuePosition,
      DispatchSettings,
      DispatchSettingsAudit,
      CronConfig,
      WhatsappMessage,
      WhatsappChat,
      WhatsappCommercial,
      WhapiChannel,
      ProviderChannel,
      Contact,
      WhatsappPoste,
      WhatsappMedia,
    ]),
    CqrsModule,
    LoggingModule,
    CallLogModule,
    JorbsModule,
    NotificationModule,
    TagsModule,
  ],
  controllers: [DispatcherController, ConversationController],
  providers: [
    { provide: MESSAGE_REPOSITORY, useClass: MessageTypeOrmRepository },
    { provide: CONVERSATION_REPOSITORY, useClass: ConversationTypeOrmRepository },
    { provide: COMMERCIAL_REPOSITORY, useClass: CommercialTypeOrmRepository },
    { provide: MEDIA_REPOSITORY, useClass: MediaTypeOrmRepository },
    DispatcherService,
    QueueService,
    WhatsappMessageService,
    MessageQueryService,
    MessageStatusService,
    InboundPersistenceService,
    OutboundMessageService,
    WhatsappChatService,
    CommunicationWhapiService,
    CommunicationMetaService,
    CommunicationMessengerService,
    CommunicationInstagramService,
    CommunicationTelegramService,
    OutboundRouterService,
    WhatsappCommercialService,
    ChannelService,
    MetaTokenService,
    ContactService,
    WhatsappPosteService,
    OfflineReinjectionJob,
    ReadOnlyEnforcementJob,
    DispatchSettingsService,
    AssignConversationHandler,
    GetDispatchSnapshotHandler,
  ],
  exports: [DispatcherService, QueueService, DispatchSettingsService],
})
export class DispatcherModule {}
