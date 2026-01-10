import { Injectable } from '@nestjs/common';
import { CreateWhatsappMessageEventDto } from './dto/create-whatsapp_message_event.dto';
import { UpdateWhatsappMessageEventDto } from './dto/update-whatsapp_message_event.dto';

@Injectable()
export class WhatsappMessageEventService {
  create(createWhatsappMessageEventDto: CreateWhatsappMessageEventDto) {
    return 'This action adds a new whatsappMessageEvent';
  }

  findAll() {
    return `This action returns all whatsappMessageEvent`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsappMessageEvent`;
  }

  update(id: number, updateWhatsappMessageEventDto: UpdateWhatsappMessageEventDto) {
    return `This action updates a #${id} whatsappMessageEvent`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappMessageEvent`;
  }
}
