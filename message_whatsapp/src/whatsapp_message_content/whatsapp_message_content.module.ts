import { Module } from '@nestjs/common';
import { WhatsappMessageContentService } from './whatsapp_message_content.service';
import { WhatsappMessageContentGateway } from './whatsapp_message_content.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessageContent } from './entities/whatsapp_message_content.entity';
import { WhatsappContact } from 'src/whatsapp_contacts/entities/whatsapp_contact.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

@Module({
   imports: [TypeOrmModule.forFeature([
          WhatsappMessageContent, WhatsappMessage, WhatsappContact 
        ])],
  providers: [WhatsappMessageContentGateway, WhatsappMessageContentService],
})
export class WhatsappMessageContentModule {}
