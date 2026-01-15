import { Module } from '@nestjs/common';
import { WhatsappCustomerService } from './whatsapp_customer.service';
import { WhatsappCustomerGateway } from './whatsapp_customer.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappCustomer } from './entities/whatsapp_customer.entity';

@Module({
   imports: [TypeOrmModule.forFeature([
          WhatsappCustomer
        ])],
  providers: [WhatsappCustomerGateway, WhatsappCustomerService],
})
export class WhatsappCustomerModule {}
