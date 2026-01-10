import { Module } from '@nestjs/common';
import { WhatsappMessageContentService } from './whatsapp_message_content.service';
import { WhatsappMessageContentGateway } from './whatsapp_message_content.gateway';

@Module({
  providers: [WhatsappMessageContentGateway, WhatsappMessageContentService],
})
export class WhatsappMessageContentModule {}
