import { Injectable } from '@nestjs/common';
import { CreateWhatsappChatLabelDto } from './dto/create-whatsapp_chat_label.dto';
import { UpdateWhatsappChatLabelDto } from './dto/update-whatsapp_chat_label.dto';

@Injectable()
export class WhatsappChatLabelService {
  create(createWhatsappChatLabelDto: CreateWhatsappChatLabelDto) {
    return 'This action adds a new whatsappChatLabel';
  }

  findAll() {
    return `This action returns all whatsappChatLabel`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsappChatLabel`;
  }

  update(id: number, updateWhatsappChatLabelDto: UpdateWhatsappChatLabelDto) {
    return `This action updates a #${id} whatsappChatLabel`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappChatLabel`;
  }
}
