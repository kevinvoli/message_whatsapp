import { Module } from '@nestjs/common';
import { WhatsappMediaContentService } from './whatsapp_media_content.service';
import { WhatsappMediaContentGateway } from './whatsapp_media_content.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMediaContent } from './entities/whatsapp_media_content.entity';
import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';

@Module({
   imports: [TypeOrmModule.forFeature([
          WhatsappMediaContent,WhatsappMessageContent
        ])],
  providers: [WhatsappMediaContentGateway, WhatsappMediaContentService],
})
export class WhatsappMediaContentModule {}
