import { Injectable } from '@nestjs/common';
import { CreateWhatsappChatEventDto } from './dto/create-whatsapp_chat_event.dto';
import { UpdateWhatsappChatEventDto } from './dto/update-whatsapp_chat_event.dto';

@Injectable()
export class WhatsappChatEventService {
  create(createWhatsappChatEventDto: CreateWhatsappChatEventDto) {
    return 'This action adds a new whatsappChatEvent';
  }

  findAll() {
    return `This action returns all whatsappChatEvent`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsappChatEvent`;
  }

  update(id: number, updateWhatsappChatEventDto: UpdateWhatsappChatEventDto) {
    return `This action updates a #${id} whatsappChatEvent`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappChatEvent`;
  }
}
