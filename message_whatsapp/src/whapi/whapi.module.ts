import { Module, OnModuleInit } from '@nestjs/common';
import { BotProviderAdapterRegistry } from 'src/flowbot/services/bot-provider-adapter-registry.service';
import { WhapiService } from './whapi.service';
import { WhapiController } from './whapi.controller';
// import { WhatsappAgentService } from 'src/whatsapp_agent/whatsapp_agent.service';
// import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { DispatcherModule } from 'src/dispatcher/dispatcher.module';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';
import { WhatsappChatModule } from 'src/whatsapp_chat/whatsapp_chat.module';
import { CommunicationWhapiModule } from 'src/communication_whapi/communication_whapi.module';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ProviderChannel } from 'src/channel/entities/provider-channel.entity';
import { ChannelService } from 'src/channel/channel.service';
import { MetaTokenService } from 'src/channel/meta-token.service';
import { Contact } from 'src/contact/entities/contact.entity';
import { ContactService } from 'src/contact/contact.service';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { WebhookEventLog } from './entities/webhook-event.entity';
import { LoggingModule } from 'src/logging/logging.module';
import { CallLogModule } from 'src/call-log/call_log.module';
import { JorbsModule } from 'src/jorbs/jorbs.module';
import { WebhookRateLimitService } from './webhook-rate-limit.service';
import { WebhookTrafficHealthService } from './webhook-traffic-health.service';
import { WebhookDegradedQueueService } from './webhook-degraded-queue.service';
import { WebhookMetricsService } from './webhook-metrics.service';
import { WebhookMetricsController } from './webhook-metrics.controller';
import { WebhookIdempotencyPurgeService } from './webhook-idempotency-purge.service';
import { WhapiAdapter } from 'src/webhooks/adapters/whapi.adapter';
import { MetaAdapter } from 'src/webhooks/adapters/meta.adapter';
import { MessengerAdapter } from 'src/webhooks/adapters/messenger.adapter';
import { InstagramAdapter } from 'src/webhooks/adapters/instagram.adapter';
import { CommunicationMessengerService } from 'src/communication_whapi/communication_messenger.service';
import { CommunicationInstagramService } from 'src/communication_whapi/communication_instagram.service';
import { TelegramAdapter } from 'src/webhooks/adapters/telegram.adapter';
import { CommunicationTelegramService } from 'src/communication_whapi/communication_telegram.service';
import { InboundMessageService } from 'src/webhooks/inbound-message.service';
import { UnifiedIngressService } from 'src/webhooks/unified-ingress.service';
import { MediaExtractionService } from 'src/ingress/domain/media-extraction.service';
import { MediaPersistenceService } from 'src/ingress/infrastructure/media-persistence.service';
import { WebhookIdempotencyService } from 'src/webhooks/idempotency/webhook-idempotency.service';
import { ProviderAdapterRegistry } from 'src/webhooks/adapters/provider-adapter.registry';
import { NotificationModule } from 'src/notification/notification.module';
import { SystemAlertModule } from 'src/system-alert/system-alert.module';
import { ChatIdValidationService } from 'src/ingress/domain/chat-id-validation.service';
import { ProviderEnrichmentService } from 'src/ingress/domain/provider-enrichment.service';
import { IncomingMessagePersistenceService } from 'src/ingress/infrastructure/incoming-message-persistence.service';
import { InboundStateUpdateService } from 'src/ingress/domain/inbound-state-update.service';
import { WhapiProviderAdapter } from './adapters/whapi-provider.adapter';
import { FlowBotModule } from 'src/flowbot/flowbot.module';
import { ChannelProviderRegistry } from 'src/channel/domain/channel-provider.registry';
import { ResolveTenantUseCase } from 'src/channel/application/resolve-tenant.use-case';
import { ContextModule } from 'src/context/context.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappCommercial,
      WhatsappMessage,
      WhatsappChat,
      QueuePosition,
      WhapiChannel,
      ProviderChannel,
      Contact,
      WhatsappPoste,
      WhatsappMedia,
      WebhookEventLog,
    ]),
    DispatcherModule,
    WhatsappMessageModule,
    WhatsappChatModule,
    CommunicationWhapiModule,
    LoggingModule,
    CallLogModule,
    JorbsModule,
    NotificationModule,
    SystemAlertModule,
    FlowBotModule,
    ContextModule,
  ],
  controllers: [WhapiController, WebhookMetricsController],
  providers: [
    WhapiService,
    WhatsappMessageService,
    WhatsappChatService,
    WhatsappCommercialService,
    ChannelService,
    MetaTokenService,
    WhatsappPosteService,
    ContactService,
    CommunicationWhapiService,
    CommunicationMetaService,
    OutboundRouterService,
    WebhookRateLimitService,
    WebhookTrafficHealthService,
    WebhookDegradedQueueService,
    WebhookMetricsService,
    WebhookIdempotencyPurgeService,
    WhapiAdapter,
    MetaAdapter,
    MessengerAdapter,
    InstagramAdapter,
    TelegramAdapter,
    CommunicationMessengerService,
    CommunicationInstagramService,
    CommunicationTelegramService,
    ProviderAdapterRegistry,
    InboundMessageService,
    UnifiedIngressService,
    WebhookIdempotencyService,
    MediaExtractionService,
    MediaPersistenceService,
    ChatIdValidationService,
    ProviderEnrichmentService,
    IncomingMessagePersistenceService,
    InboundStateUpdateService,
    WhapiProviderAdapter,
    ChannelProviderRegistry,
    ResolveTenantUseCase,
  ],
})
export class WhapiModule implements OnModuleInit {
  constructor(
    private readonly whapiAdapter: WhapiProviderAdapter,
    private readonly botAdapterRegistry: BotProviderAdapterRegistry,
  ) {}

  onModuleInit(): void {
    this.botAdapterRegistry.register(this.whapiAdapter);
  }
}
