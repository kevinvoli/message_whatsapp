import { Injectable } from '@nestjs/common';
import { CreateWhatsappLastMessageDto } from './dto/create-whatsapp_last_message.dto';
import { UpdateWhatsappLastMessageDto } from './dto/update-whatsapp_last_message.dto';

@Injectable()
export class WhatsappLastMessageService {
  create(createWhatsappLastMessageDto: CreateWhatsappLastMessageDto) {
    return 'This action adds a new whatsappLastMessage';
  }

  findAll() {
    return `This action returns all whatsappLastMessage`;
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappLastMessage`;
  }

  update(
    id: string,
    updateWhatsappLastMessageDto: UpdateWhatsappLastMessageDto,
  ) {
    return `This action updates a #${id} whatsappLastMessage`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappLastMessage`;
  }
}
