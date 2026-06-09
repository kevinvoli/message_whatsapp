import { Module } from '@nestjs/common';
import { MediaStorageService } from './media-storage.service';
import { MediaFileController } from './media-file.controller';

@Module({
  controllers: [MediaFileController],
  providers: [MediaStorageService],
  exports: [MediaStorageService],
})
export class MediaStorageModule {}
