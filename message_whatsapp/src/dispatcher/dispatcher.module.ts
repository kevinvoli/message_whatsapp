import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatcherService } from './dispatcher.service';
import { QueueService } from './services/queue.service';
import { QueuePosition } from './entities/queue-position.entity';
import { DispatchSettings } from './entities/dispatch-settings.entity';
import { DispatchSettingsAudit } from './entities/dispatch-settings-audit.entity';
import { JorbsModule } from 'src/jorbs/jorbs.module';
import { CronConfig } from 'src/jorbs/entities/cron-config.entity';
import { WhatsappMessageModule } from '../whatsapp_message/whatsapp_message.module';
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
import { OfflineReinjectionJob } from 'src/jorbs/offline-reinjection.job';
import { OrphanCheckerJob } from 'src/jorbs/orphan-checker.job';
import { DispatchSettingsService } from './services/dispatch-settings.service';
import { DispatchQueryService } from './infrastructure/dispatch-query.service';
import { DispatchPolicyService } from './domain/dispatch-policy.service';
import { SlaPolicyService } from './domain/sla-policy.service';
import { AssignConversationUseCase } from './application/assign-conversation.use-case';
import { ReinjectConversationUseCase } from './application/reinject-conversation.use-case';
import { RedispatchWaitingUseCase } from './application/redispatch-waiting.use-case';
import { ResetStuckActiveUseCase } from './application/reset-stuck-active.use-case';
import { ReadOnlyEnforcementJob } from 'src/jorbs/read-only-enforcement.job';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { CallLogModule } from 'src/call-log/call_log.module';
import { NotificationModule } from 'src/notification/notification.module';

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
    forwardRef(() => WhatsappMessageModule),
    LoggingModule,
    CallLogModule,
    JorbsModule,
    NotificationModule,
  ],
  controllers: [DispatcherController],
  providers: [
    DispatcherService,
    QueueService,
    WhatsappMessageService,
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
    OrphanCheckerJob,
    ReadOnlyEnforcementJob,
    DispatchSettingsService,
    DispatchQueryService,
    DispatchPolicyService,
    SlaPolicyService,
    AssignConversationUseCase,
    ReinjectConversationUseCase,
    RedispatchWaitingUseCase,
    ResetStuckActiveUseCase,
  ],
  exports: [
    DispatcherService,
    QueueService,
    DispatchSettingsService,
    DispatchQueryService,
    DispatchPolicyService,
    SlaPolicyService,
    AssignConversationUseCase,
    ReinjectConversationUseCase,
  ],
})
export class DispatcherModule {}
