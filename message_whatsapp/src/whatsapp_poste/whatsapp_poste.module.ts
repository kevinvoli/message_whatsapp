import { Module } from '@nestjs/common';
import { WhatsappPosteService } from './whatsapp_poste.service';
import { WhatsappPosteController } from './whatsapp_poste.controller';

@Module({
  controllers: [WhatsappPosteController],
  providers: [WhatsappPosteService],
})
export class WhatsappPosteModule {}
