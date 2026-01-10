import { Module } from '@nestjs/common';
import { WhatsappButtonService } from './whatsapp_button.service';
import { WhatsappButtonGateway } from './whatsapp_button.gateway';

@Module({
  providers: [WhatsappButtonGateway, WhatsappButtonService],
})
export class WhatsappButtonModule {}
