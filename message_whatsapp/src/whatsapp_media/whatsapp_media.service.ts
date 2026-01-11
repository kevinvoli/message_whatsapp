import { Injectable } from '@nestjs/common';
import { CreateWhatsappMediaDto } from './dto/create-whatsapp_media.dto';
import { UpdateWhatsappMediaDto } from './dto/update-whatsapp_media.dto';

@Injectable()
export class WhatsappMediaService {
  create(createWhatsappMediaDto: CreateWhatsappMediaDto) {
    return 'This action adds a new whatsappMedia';
  }

  findAll() {
    return `This action returns all whatsappMedia`;
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappMedia`;
  }

  update(id: string, updateWhatsappMediaDto: UpdateWhatsappMediaDto) {
    return `This action updates a #${id} whatsappMedia`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappMedia`;
  }
}
