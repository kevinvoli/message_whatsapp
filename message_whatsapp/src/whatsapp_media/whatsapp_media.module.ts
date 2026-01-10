import { Module } from '@nestjs/common';
import { WhatsappMediaService } from './whatsapp_media.service';
import { WhatsappMediaGateway } from './whatsapp_media.gateway';

@Module({
  providers: [WhatsappMediaGateway, WhatsappMediaService],
})
export class WhatsappMediaModule {}
