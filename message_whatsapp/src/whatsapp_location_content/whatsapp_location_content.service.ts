import { Injectable } from '@nestjs/common';
import { CreateWhatsappLocationContentDto } from './dto/create-whatsapp_location_content.dto';
import { UpdateWhatsappLocationContentDto } from './dto/update-whatsapp_location_content.dto';

@Injectable()
export class WhatsappLocationContentService {
  create(createWhatsappLocationContentDto: CreateWhatsappLocationContentDto) {
    return 'This action adds a new whatsappLocationContent';
  }

  findAll() {
    return `This action returns all whatsappLocationContent`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsappLocationContent`;
  }

  update(id: number, updateWhatsappLocationContentDto: UpdateWhatsappLocationContentDto) {
    return `This action updates a #${id} whatsappLocationContent`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappLocationContent`;
  }
}
