import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronConfig } from './entities/cron-config.entity';
import { CronConfigService } from './cron-config.service';
import { CronConfigController } from './cron-config.controller';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';
import { LoggingModule } from 'src/logging/logging.module';
import { NotificationModule } from 'src/notification/notification.module';
import { SystemConfigModule } from 'src/system-config/system-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CronConfig, WhatsappChat]),
    forwardRef(() => WhatsappMessageModule),
    LoggingModule,
    NotificationModule,
    SystemConfigModule,
  ],
  controllers: [CronConfigController],
  providers: [
    CronConfigService,
  ],
  exports: [CronConfigService],
})
export class JorbsModule {}
