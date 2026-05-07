import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FollowUp } from './entities/follow_up.entity';
import { FollowUpTemplateMapping } from './entities/follow-up-template-mapping.entity';
import { FollowUpService } from './follow_up.service';
import { FollowUpController } from './follow_up.controller';
import { FollowUpReminderService } from './follow_up_reminder.service';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ProviderChannel } from 'src/channel/entities/provider-channel.entity';
import { PlatformSettingsModule } from 'src/platform-settings/platform-settings.module';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { CommunicationMessengerService } from 'src/communication_whapi/communication_messenger.service';
import { CommunicationInstagramService } from 'src/communication_whapi/communication_instagram.service';
import { CommunicationTelegramService } from 'src/communication_whapi/communication_telegram.service';
import { ChannelService } from 'src/channel/channel.service';
import { MetaTokenService } from 'src/channel/meta-token.service';
import { ChannelProviderRegistry } from 'src/channel/domain/channel-provider.registry';
import { ResolveTenantUseCase } from 'src/channel/application/resolve-tenant.use-case';
import { LoggingModule } from 'src/logging/logging.module';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FollowUp,
      FollowUpTemplateMapping,
      Contact,
      WhatsappChat,
      WhapiChannel,
      ProviderChannel,
    ]),
    PlatformSettingsModule,
    LoggingModule,
    RedisModule,
  ],
  controllers: [FollowUpController],
  providers: [
    FollowUpService,
    FollowUpReminderService,
    OutboundRouterService,
    CommunicationWhapiService,
    CommunicationMetaService,
    CommunicationMessengerService,
    CommunicationInstagramService,
    CommunicationTelegramService,
    ChannelService,
    MetaTokenService,
    ChannelProviderRegistry,
    ResolveTenantUseCase,
  ],
  exports: [FollowUpService],
})
export class FollowUpModule {}
