import { Module } from '@nestjs/common';
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
import { Contact } from 'src/contact/entities/contact.entity';
import { ContactService } from 'src/contact/contact.service';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { AutoMessageOrchestrator } from 'src/message-auto/auto-message-orchestrator.service';
import { AutoMessageScopeConfigService } from 'src/message-auto/auto-message-scope-config.service';
import { MessageAutoService } from 'src/message-auto/message-auto.service';
import { MessageAuto } from 'src/message-auto/entities/message-auto.entity';
import { AutoMessageScopeConfig } from 'src/message-auto/entities/auto-message-scope-config.entity';
import { WebhookEventLog } from './entities/webhook-event.entity';
import { LoggingModule } from 'src/logging/logging.module';
import { CallLogModule } from 'src/call-log/call_log.module';
import { WebhookRateLimitService } from './webhook-rate-limit.service';
import { WebhookTrafficHealthService } from './webhook-traffic-health.service';
import { WebhookDegradedQueueService } from './webhook-degraded-queue.service';
import { WebhookMetricsService } from './webhook-metrics.service';
import { WebhookMetricsController } from './webhook-metrics.controller';
import { WebhookIdempotencyPurgeService } from './webhook-idempotency-purge.service';
import { WhapiAdapter } from 'src/webhooks/adapters/whapi.adapter';
import { MetaAdapter } from 'src/webhooks/adapters/meta.adapter';
import { InboundMessageService } from 'src/webhooks/inbound-message.service';
import { UnifiedIngressService } from 'src/webhooks/unified-ingress.service';
import { WebhookIdempotencyService } from 'src/webhooks/idempotency/webhook-idempotency.service';
import { ProviderAdapterRegistry } from 'src/webhooks/adapters/provider-adapter.registry';

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
      MessageAuto,
      AutoMessageScopeConfig,
      WebhookEventLog,
    ]),
    DispatcherModule,
    WhatsappMessageModule,
    WhatsappChatModule,
    CommunicationWhapiModule,
    LoggingModule,
    CallLogModule,
  ],
  controllers: [WhapiController, WebhookMetricsController],
  providers: [
    WhapiService,
    WhatsappMessageService,
    WhatsappChatService,
    WhatsappCommercialService,
    ChannelService,
    WhatsappPosteService,
    ContactService,
    CommunicationWhapiService,
    CommunicationMetaService,
    OutboundRouterService,
    AutoMessageOrchestrator,
    AutoMessageScopeConfigService,
    MessageAutoService,
    WebhookRateLimitService,
    WebhookTrafficHealthService,
    WebhookDegradedQueueService,
    WebhookMetricsService,
    WebhookIdempotencyPurgeService,
    WhapiAdapter,
    MetaAdapter,
    ProviderAdapterRegistry,
    InboundMessageService,
    UnifiedIngressService,
    WebhookIdempotencyService,
  ],
})
export class WhapiModule {}
