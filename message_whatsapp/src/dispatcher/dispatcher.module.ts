import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatcherService } from './dispatcher.service';
import { QueueService } from './services/queue.service';
import { QueuePosition } from './entities/queue-position.entity';
import { DispatchSettings } from './entities/dispatch-settings.entity';
import { DispatchSettingsAudit } from './entities/dispatch-settings-audit.entity';
import { WhatsappMessageModule } from '../whatsapp_message/whatsapp_message.module';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ChannelService } from 'src/channel/channel.service';
import { ContactService } from 'src/contact/contact.service';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { LoggingModule } from 'src/logging/logging.module';
import { DispatcherController } from './dispatcher.controller';
import { OfflineReinjectionJob } from 'src/jorbs/offline-reinjection.job';
import { DispatchSettingsService } from './services/dispatch-settings.service';
import { ReadOnlyEnforcementJob } from 'src/jorbs/read-only-enforcement.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QueuePosition,
      DispatchSettings,
      DispatchSettingsAudit,
      WhatsappMessage,
      WhatsappChat,
      WhatsappCommercial,
      WhapiChannel,
      Contact,
      WhatsappPoste,
    ]),
    forwardRef(() => WhatsappMessageModule),
    LoggingModule,
  ],
  controllers: [DispatcherController],
  providers: [
    DispatcherService,
    QueueService,
    WhatsappMessageService,
    WhatsappChatService,
    CommunicationWhapiService,
    WhatsappCommercialService,
    ChannelService,
    ContactService,
    WhatsappPosteService,
    OfflineReinjectionJob,
    ReadOnlyEnforcementJob,
    DispatchSettingsService,
  ],
  exports: [DispatcherService, QueueService, DispatchSettingsService],
})
export class DispatcherModule {}
