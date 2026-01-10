import { Module } from '@nestjs/common';
import { WhatsappErrorService } from './whatsapp_error.service';
import { WhatsappErrorGateway } from './whatsapp_error.gateway';

@Module({
  providers: [WhatsappErrorGateway, WhatsappErrorService],
})
export class WhatsappErrorModule {}
