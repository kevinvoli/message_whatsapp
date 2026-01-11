import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappChatParticipantDto } from './create-whatsapp_chat_participant.dto';

export class UpdateWhatsappChatParticipantDto extends PartialType(CreateWhatsappChatParticipantDto) {
  id: string;
}
