import { Module } from '@nestjs/common';
import { WhatsappMediaContentService } from './whatsapp_media_content.service';
import { WhatsappMediaContentGateway } from './whatsapp_media_content.gateway';

@Module({
  providers: [WhatsappMediaContentGateway, WhatsappMediaContentService],
})
export class WhatsappMediaContentModule {}
