import { Injectable } from '@nestjs/common';
import { CreateWhatsappChatDto } from './dto/create-whatsapp_chat.dto';
import { UpdateWhatsappChatDto } from './dto/update-whatsapp_chat.dto';

@Injectable()
export class WhatsappChatService {
  create(createWhatsappChatDto: CreateWhatsappChatDto) {
    return 'This action adds a new whatsappChat';
  }

  findAll() {
    return `This action returns all whatsappChat`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsappChat`;
  }

  update(id: number, updateWhatsappChatDto: UpdateWhatsappChatDto) {
    return `This action updates a #${id} whatsappChat`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappChat`;
  }
}
