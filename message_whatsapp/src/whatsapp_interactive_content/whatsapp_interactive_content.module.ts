import { Module } from '@nestjs/common';
import { WhatsappInteractiveContentService } from './whatsapp_interactive_content.service';
import { WhatsappInteractiveContentGateway } from './whatsapp_interactive_content.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappInteractiveContent } from './entities/whatsapp_interactive_content.entity';
import { WhatsappButton } from 'src/whatsapp_button/entities/whatsapp_button.entity';
import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';

@Module({
   imports: [TypeOrmModule.forFeature([
          WhatsappInteractiveContent,WhatsappMessageContent, WhatsappButton
        ])],
  providers: [WhatsappInteractiveContentGateway, WhatsappInteractiveContentService],
})
export class WhatsappInteractiveContentModule {}
