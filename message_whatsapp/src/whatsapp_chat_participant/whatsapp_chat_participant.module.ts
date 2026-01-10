import { Module } from '@nestjs/common';
import { WhatsappChatParticipantService } from './whatsapp_chat_participant.service';
import { WhatsappChatParticipantGateway } from './whatsapp_chat_participant.gateway';

@Module({
  providers: [WhatsappChatParticipantGateway, WhatsappChatParticipantService],
})
export class WhatsappChatParticipantModule {}
