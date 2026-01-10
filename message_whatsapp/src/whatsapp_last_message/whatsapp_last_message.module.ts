import { Module } from '@nestjs/common';
import { WhatsappLastMessageService } from './whatsapp_last_message.service';
import { WhatsappLastMessageGateway } from './whatsapp_last_message.gateway';

@Module({
  providers: [WhatsappLastMessageGateway, WhatsappLastMessageService],
})
export class WhatsappLastMessageModule {}
