import { Module } from '@nestjs/common';
import { WhatsappInteractiveContentService } from './whatsapp_interactive_content.service';
import { WhatsappInteractiveContentGateway } from './whatsapp_interactive_content.gateway';

@Module({
  providers: [WhatsappInteractiveContentGateway, WhatsappInteractiveContentService],
})
export class WhatsappInteractiveContentModule {}
