import { Injectable } from '@nestjs/common';
import { CreateWhatsappButtonDto } from './dto/create-whatsapp_button.dto';
import { UpdateWhatsappButtonDto } from './dto/update-whatsapp_button.dto';

@Injectable()
export class WhatsappButtonService {
  create(createWhatsappButtonDto: CreateWhatsappButtonDto) {
    return 'This action adds a new whatsappButton';
  }

  findAll() {
    return `This action returns all whatsappButton`;
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappButton`;
  }

  update(id: string, updateWhatsappButtonDto: UpdateWhatsappButtonDto) {
    return `This action updates a #${id} whatsappButton`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappButton`;
  }
}
