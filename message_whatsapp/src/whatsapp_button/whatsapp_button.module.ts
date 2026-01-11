import { Module } from '@nestjs/common';
import { WhatsappButtonService } from './whatsapp_button.service';
import { WhatsappButtonGateway } from './whatsapp_button.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappButton } from './entities/whatsapp_button.entity';
import { WhatsappInteractiveContent } from 'src/whatsapp_interactive_content/entities/whatsapp_interactive_content.entity';

@Module({
   imports: [TypeOrmModule.forFeature([
      WhatsappButton,WhatsappInteractiveContent
    ])],
  providers: [WhatsappButtonGateway, WhatsappButtonService],
})
export class WhatsappButtonModule {}
