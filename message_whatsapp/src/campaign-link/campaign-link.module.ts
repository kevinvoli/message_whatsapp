import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignLink } from './entities/campaign-link.entity';
import { CampaignLinkClick } from './entities/campaign-link-click.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CampaignLinkService } from './campaign-link.service';
import { CampaignLinkController, CampaignTrackingController } from './campaign-link.controller';
import { MediaAssetModule } from 'src/media-asset/media-asset.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CampaignLink, CampaignLinkClick, WhapiChannel, WhatsappChat]),
    MediaAssetModule,
  ],
  controllers: [CampaignLinkController, CampaignTrackingController],
  providers: [CampaignLinkService],
  exports: [CampaignLinkService],
})
export class CampaignLinkModule {}
