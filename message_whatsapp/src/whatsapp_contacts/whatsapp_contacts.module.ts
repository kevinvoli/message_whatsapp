import { Module } from '@nestjs/common';
import { WhatsappContactsService } from './whatsapp_contacts.service';
import { WhatsappContactsGateway } from './whatsapp_contacts.gateway';

@Module({
  providers: [WhatsappContactsGateway, WhatsappContactsService],
})
export class WhatsappContactsModule {}
