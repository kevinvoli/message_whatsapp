import { Module } from '@nestjs/common';
import { WhatsappMessageContentService } from './whatsapp_message_content.service';
import { WhatsappMessageContentGateway } from './whatsapp_message_content.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessageContent } from './entities/whatsapp_message_content.entity';
import { WhatsappInteractiveContentGateway } from 'src/whatsapp_interactive_content/whatsapp_interactive_content.gateway';
import { WhatsappLocationContent } from 'src/whatsapp_location_content/entities/whatsapp_location_content.entity';
import { WhatsappMediaContent } from 'src/whatsapp_media_content/entities/whatsapp_media_content.entity';
import { WhatsappContact } from 'src/whatsapp_contacts/entities/whatsapp_contact.entity';
import { WhatsappTextContent } from 'src/whatsapp_text_content/entities/whatsapp_text_content.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappMessageContent,
      WhatsappMessage,
      WhatsappTextContent,
      WhatsappContact,
      WhatsappMediaContent,
      WhatsappLocationContent,
      WhatsappInteractiveContentGateway,
    ]),
  ],
  providers: [WhatsappMessageContentGateway, WhatsappMessageContentService],
})
export class WhatsappMessageContentModule {}
