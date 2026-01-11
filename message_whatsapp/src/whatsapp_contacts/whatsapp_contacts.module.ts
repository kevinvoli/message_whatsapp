import { Module } from '@nestjs/common';
import { WhatsappContactsService } from './whatsapp_contacts.service';
import { WhatsappContactsGateway } from './whatsapp_contacts.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappContact } from './entities/whatsapp_contact.entity';
import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';

@Module({
   imports: [TypeOrmModule.forFeature([
          WhatsappContact, WhatsappMessageContent
        ])],
  providers: [WhatsappContactsGateway, WhatsappContactsService],
})
export class WhatsappContactsModule {}
