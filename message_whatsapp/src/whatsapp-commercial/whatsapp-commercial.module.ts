import { Module } from '@nestjs/common';
import { WhatsappCommercialService } from './whatsapp-commercial.service';
import { WhatsappCommercialGateway } from './whatsapp-commercial.gateway';

@Module({
  providers: [WhatsappCommercialGateway, WhatsappCommercialService],
})
export class WhatsappCommercialModule {}
