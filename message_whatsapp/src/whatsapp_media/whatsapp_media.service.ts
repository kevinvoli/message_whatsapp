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

  findOne(id: number) {
    return `This action returns a #${id} whatsappMedia`;
  }

  update(id: number, updateWhatsappMediaDto: UpdateWhatsappMediaDto) {
    return `This action updates a #${id} whatsappMedia`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappMedia`;
  }
}
