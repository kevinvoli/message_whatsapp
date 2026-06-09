import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaStorageService } from './media-storage.service';
import { MediaDownloadService } from './media-download.service';
import { MediaBackfillService } from './media-backfill.service';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { CommunicationMessengerService } from 'src/communication_whapi/communication_messenger.service';
import { ChannelModule } from 'src/channel/channel.module';
import { LoggingModule } from 'src/logging/logging.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappMedia, WhapiChannel, WhatsappChat]),
    ChannelModule,
    LoggingModule,
  ],
  providers: [
    MediaStorageService,
    MediaDownloadService,
    MediaBackfillService,
    CommunicationMetaService,
    CommunicationWhapiService,
    CommunicationMessengerService,
  ],
  exports: [MediaStorageService, MediaDownloadService],
})
export class MediaStorageModule {}
