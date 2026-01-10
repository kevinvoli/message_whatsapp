import { Module } from '@nestjs/common';
import { WhatsappMessageContextService } from './whatsapp_message_context.service';
import { WhatsappMessageContextGateway } from './whatsapp_message_context.gateway';

@Module({
  providers: [WhatsappMessageContextGateway, WhatsappMessageContextService],
})
export class WhatsappMessageContextModule {}
