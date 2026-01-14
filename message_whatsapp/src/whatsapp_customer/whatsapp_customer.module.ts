import { Module } from '@nestjs/common';
import { WhatsappCustomerService } from './whatsapp_customer.service';
import { WhatsappCustomerGateway } from './whatsapp_customer.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappCustomer } from './entities/whatsapp_customer.entity';
import { WhatsappConversation } from 'src/whatsapp_conversation/entities/whatsapp_conversation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappCustomer, WhatsappConversation])],
  providers: [WhatsappCustomerGateway, WhatsappCustomerService],
})
export class WhatsappCustomerModule {}
