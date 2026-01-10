import { Module } from '@nestjs/common';
import { WhatsappCustomerService } from './whatsapp_customer.service';
import { WhatsappCustomerGateway } from './whatsapp_customer.gateway';

@Module({
  providers: [WhatsappCustomerGateway, WhatsappCustomerService],
})
export class WhatsappCustomerModule {}
