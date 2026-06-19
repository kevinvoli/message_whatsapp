import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaAsset } from './entities/media-asset.entity';
import { MediaAssetService } from './media-asset.service';
import { MediaAssetController, MediaPreviewController } from './media-asset.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MediaAsset])],
  controllers: [MediaAssetController, MediaPreviewController],
  providers: [MediaAssetService],
  exports: [MediaAssetService],
})
export class MediaAssetModule {}
