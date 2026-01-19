import { Injectable } from '@nestjs/common';
import { CreateWhatsappMessageContextDto } from './dto/create-whatsapp_message_context.dto';
import { UpdateWhatsappMessageContextDto } from './dto/update-whatsapp_message_context.dto';

@Injectable()
export class WhatsappMessageContextService {
  create(createWhatsappMessageContextDto: CreateWhatsappMessageContextDto) {
    return 'This action adds a new whatsappMessageContext';
  }

  findAll() {
    return `This action returns all whatsappMessageContext`;
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappMessageContext`;
  }

  update(
    id: string,
    updateWhatsappMessageContextDto: UpdateWhatsappMessageContextDto,
  ) {
    return `This action updates a #${id} whatsappMessageContext`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappMessageContext`;
  }
}
