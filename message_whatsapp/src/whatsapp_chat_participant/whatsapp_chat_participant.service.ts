import { Injectable } from '@nestjs/common';
import { CreateWhatsappChatParticipantDto } from './dto/create-whatsapp_chat_participant.dto';
import { UpdateWhatsappChatParticipantDto } from './dto/update-whatsapp_chat_participant.dto';

@Injectable()
export class WhatsappChatParticipantService {
  create(createWhatsappChatParticipantDto: CreateWhatsappChatParticipantDto) {
    return 'This action adds a new whatsappChatParticipant';
  }

  findAll() {
    return `This action returns all whatsappChatParticipant`;
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappChatParticipant`;
  }

  update(
    id: string,
    updateWhatsappChatParticipantDto: UpdateWhatsappChatParticipantDto,
  ) {
    return `This action updates a #${id} whatsappChatParticipant`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappChatParticipant`;
  }
}
