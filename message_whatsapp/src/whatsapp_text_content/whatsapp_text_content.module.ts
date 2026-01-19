import { Module } from '@nestjs/common';
import { WhatsappTextContentService } from './whatsapp_text_content.service';
import { WhatsappTextContentGateway } from './whatsapp_text_content.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappTextContent } from './entities/whatsapp_text_content.entity';
import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappTextContent, WhatsappMessageContent]),
  ],
  providers: [WhatsappTextContentGateway, WhatsappTextContentService],
})
export class WhatsappTextContentModule {}
