import { Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';

@Module({
  providers: [ RealtimeService,WhatsappMessageGateway,WhatsappMessageService,WhatsappChatService,WhatsappCommercialService],
})
export class RealtimeModule {}
