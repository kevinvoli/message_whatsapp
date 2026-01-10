import { Module } from '@nestjs/common';
import { WhatsappTextContentService } from './whatsapp_text_content.service';
import { WhatsappTextContentGateway } from './whatsapp_text_content.gateway';

@Module({
  providers: [WhatsappTextContentGateway, WhatsappTextContentService],
})
export class WhatsappTextContentModule {}
