import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronConfig } from './entities/cron-config.entity';
import { CronConfigService } from './cron-config.service';
import { CronConfigController } from './cron-config.controller';
import { NotificationModule } from 'src/notification/notification.module';
import { TasksService } from './tasks.service';
import { AutoMessageMasterJob } from './auto-message-master.job';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { AutoMessageKeyword } from 'src/message-auto/entities/auto-message-keyword.entity';
import { MessageAutoModule } from 'src/message-auto/message-auto.module';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';
import { LoggingModule } from 'src/logging/logging.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CronConfig, WhatsappChat, AutoMessageKeyword]),
    NotificationModule,
    forwardRef(() => MessageAutoModule),
    forwardRef(() => WhatsappMessageModule),
    LoggingModule,
  ],
  controllers: [CronConfigController],
  providers: [
    CronConfigService,
    TasksService,
    AutoMessageMasterJob,
  ],
  exports: [CronConfigService],
})
export class JorbsModule {}
