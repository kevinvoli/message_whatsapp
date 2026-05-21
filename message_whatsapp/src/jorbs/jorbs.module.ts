import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronConfig } from './entities/cron-config.entity';
import { CronConfigService } from './cron-config.service';
import { CronConfigController } from './cron-config.controller';
import { TasksService } from './tasks.service';
import { AutoMessageMasterJob } from './auto-message-master.job';
import { DisconnectAllCommercialsJob } from './disconnect-all-commercials.job';
import { IdleDisconnectJob } from './idle-disconnect.job';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { AutoMessageKeyword } from 'src/message-auto/entities/auto-message-keyword.entity';
import { MessageAutoModule } from 'src/message-auto/message-auto.module';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';
import { LoggingModule } from 'src/logging/logging.module';
import { NotificationModule } from 'src/notification/notification.module';
import { ConnectionLogModule } from 'src/connection-log/connection-log.module';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { DispatchSettings } from 'src/dispatcher/entities/dispatch-settings.entity';
import { DispatcherModule } from 'src/dispatcher/dispatcher.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CronConfig,
      WhatsappChat,
      AutoMessageKeyword,
      WhatsappCommercial,
      DispatchSettings,
    ]),
    forwardRef(() => MessageAutoModule),
    forwardRef(() => WhatsappMessageModule),
    forwardRef(() => DispatcherModule),
    LoggingModule,
    NotificationModule,
    ConnectionLogModule,
  ],
  controllers: [CronConfigController],
  providers: [
    CronConfigService,
    TasksService,
    AutoMessageMasterJob,
    DisconnectAllCommercialsJob,
    IdleDisconnectJob,
  ],
  exports: [CronConfigService],
})
export class JorbsModule {}
