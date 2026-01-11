import { Module } from '@nestjs/common';
import { WhatsappChatParticipantService } from './whatsapp_chat_participant.service';
import { WhatsappChatParticipantGateway } from './whatsapp_chat_participant.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappChatParticipant } from './entities/whatsapp_chat_participant.entity';

@Module({
   imports: [TypeOrmModule.forFeature([
          WhatsappChatParticipant
        ])],
  providers: [WhatsappChatParticipantGateway, WhatsappChatParticipantService],
})
export class WhatsappChatParticipantModule {}
