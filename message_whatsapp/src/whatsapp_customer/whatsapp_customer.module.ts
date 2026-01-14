import { Module } from '@nestjs/common';
import { WhatsappCustomerService } from './whatsapp_customer.service';
import { WhatsappCustomerGateway } from './whatsapp_customer.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappCustomer } from './entities/whatsapp_customer.entity';
import { WhatsappConversation } from 'src/whatsapp_conversation/entities/whatsapp_conversation.entity';
import { WhatsappCustomerController } from './whatsapp_customer.controller';

@Module({
   imports: [TypeOrmModule.forFeature([
          WhatsappCustomer, WhatsappConversation
        ])],
  controllers: [WhatsappCustomerController],
  providers: [WhatsappCustomerGateway, WhatsappCustomerService],
  exports: [WhatsappCustomerService],
})
export class WhatsappCustomerModule {}
