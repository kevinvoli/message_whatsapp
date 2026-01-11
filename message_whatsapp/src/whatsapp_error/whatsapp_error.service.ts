import { Injectable } from '@nestjs/common';
import { CreateWhatsappErrorDto } from './dto/create-whatsapp_error.dto';
import { UpdateWhatsappErrorDto } from './dto/update-whatsapp_error.dto';

@Injectable()
export class WhatsappErrorService {
  create(createWhatsappErrorDto: CreateWhatsappErrorDto) {
    return 'This action adds a new whatsappError';
  }

  findAll() {
    return `This action returns all whatsappError`;
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappError`;
  }

  update(id: string, updateWhatsappErrorDto: UpdateWhatsappErrorDto) {
    return `This action updates a #${id} whatsappError`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappError`;
  }
}
