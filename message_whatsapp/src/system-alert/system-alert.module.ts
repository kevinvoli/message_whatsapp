import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SystemAlertService } from './system-alert.service';
import { SystemAlertController } from './system-alert.controller';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { SystemAlertConfig } from './entities/system-alert-config.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { LoggingModule } from 'src/logging/logging.module';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    NotificationModule,
    TypeOrmModule.forFeature([WhapiChannel, WhatsappChat, SystemAlertConfig]),
  ],
  providers: [
    SystemAlertService,
    CommunicationWhapiService,
  ],
  controllers: [SystemAlertController],
  exports: [SystemAlertService],
})
export class SystemAlertModule {}
