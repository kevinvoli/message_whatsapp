import { Module } from '@nestjs/common';
import { WhatsappLocationContentService } from './whatsapp_location_content.service';
import { WhatsappLocationContentGateway } from './whatsapp_location_content.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappLocationContent } from './entities/whatsapp_location_content.entity';
import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappLocationContent, WhatsappMessageContent]),
  ],
  providers: [WhatsappLocationContentGateway, WhatsappLocationContentService],
})
export class WhatsappLocationContentModule {}
