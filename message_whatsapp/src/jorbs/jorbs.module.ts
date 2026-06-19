import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronConfig } from './entities/cron-config.entity';
import { CronConfigService } from './cron-config.service';
import { CronConfigController } from './cron-config.controller';
import { DisconnectAllCommercialsJob } from './disconnect-all-commercials.job';
import { IdleDisconnectJob } from './idle-disconnect.job';
import { WindowReminderJob } from './window-reminder.job';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { DispatchSettings } from 'src/dispatcher/entities/dispatch-settings.entity';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';
import { LoggingModule } from 'src/logging/logging.module';
import { NotificationModule } from 'src/notification/notification.module';
import { SystemConfigModule } from 'src/system-config/system-config.module';
import { ConnectionLogModule } from 'src/connection-log/connection-log.module';
import { DispatcherModule } from 'src/dispatcher/dispatcher.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CronConfig, WhatsappChat, WhatsappCommercial, DispatchSettings]),
    forwardRef(() => WhatsappMessageModule),
    forwardRef(() => DispatcherModule),
    LoggingModule,
    NotificationModule,
    SystemConfigModule,
    ConnectionLogModule,
  ],
  controllers: [CronConfigController],
  providers: [
    CronConfigService,
    DisconnectAllCommercialsJob,
    IdleDisconnectJob,
    WindowReminderJob,
  ],
  exports: [CronConfigService],
})
export class JorbsModule {}
