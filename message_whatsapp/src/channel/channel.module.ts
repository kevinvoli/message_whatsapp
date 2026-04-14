import { Module, OnModuleInit } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { MetaTokenService } from './meta-token.service';
import { ChannelProviderRegistry } from './domain/channel-provider.registry';
import { ChannelPersistenceHelper } from './infrastructure/channel-persistence.helper';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhapiChannel } from './entities/channel.entity';
import { ProviderChannel } from './entities/provider-channel.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { CommunicationTelegramService } from 'src/communication_whapi/communication_telegram.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappChatModule } from 'src/whatsapp_chat/whatsapp_chat.module';
import { LoggingModule } from 'src/logging/logging.module';
import { JorbsModule } from 'src/jorbs/jorbs.module';
import { FlowBotModule } from 'src/flowbot/flowbot.module';
import { BotProviderAdapterRegistry } from 'src/flowbot/services/bot-provider-adapter-registry.service';
import { WhapiChannelProviderService } from './providers/whapi-channel-provider.service';
import { MetaChannelProviderService } from './providers/meta-channel-provider.service';
import { MessengerChannelProviderService } from './providers/messenger-channel-provider.service';
import { InstagramChannelProviderService } from './providers/instagram-channel-provider.service';
import { TelegramChannelProviderService } from './providers/telegram-channel-provider.service';
import { CreateChannelUseCase } from './application/create-channel.use-case';
import { AssignChannelPosteUseCase } from './application/assign-channel-poste.use-case';
import { ResolveTenantUseCase } from './application/resolve-tenant.use-case';
import { MetaProviderAdapter } from './adapters/meta-provider.adapter';

/**
 * TICKET-05-B/C — Tous les providers sont enregistrés dans le module.
 * Chaque provider s'auto-enregistre dans `ChannelProviderRegistry` via `onModuleInit()`.
 * `ChannelService` délègue aux use cases (CreateChannelUseCase, AssignChannelPosteUseCase, ResolveTenantUseCase).
 *
 * TICKET-12-C — MetaProviderAdapter enregistré dans BotProviderAdapterRegistry via onModuleInit().
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WhapiChannel, ProviderChannel, WhatsappChat, WhatsappPoste]),
    LoggingModule,
    JorbsModule,
    WhatsappChatModule,
    FlowBotModule,
  ],
  controllers: [ChannelController],
  providers: [
    ChannelService,
    ChannelPersistenceHelper,
    ChannelProviderRegistry,
    MetaTokenService,
    CommunicationWhapiService,
    CommunicationMetaService,
    CommunicationTelegramService,
    // ── Use cases application ──────────────────────────────────────────────
    CreateChannelUseCase,
    AssignChannelPosteUseCase,
    ResolveTenantUseCase,
    // ── Stratégies provider (canal provisioning) ───────────────────────────
    WhapiChannelProviderService,
    MetaChannelProviderService,
    MessengerChannelProviderService,
    InstagramChannelProviderService,
    TelegramChannelProviderService,
    // ── BotProviderAdapter (FlowBot outbound routing) ──────────────────────
    MetaProviderAdapter,
  ],
  exports: [ChannelService, MetaTokenService, ChannelProviderRegistry],
})
export class ChannelModule implements OnModuleInit {
  constructor(
    private readonly metaAdapter: MetaProviderAdapter,
    private readonly botAdapterRegistry: BotProviderAdapterRegistry,
  ) {}

  onModuleInit(): void {
    this.botAdapterRegistry.register(this.metaAdapter);
  }
}
