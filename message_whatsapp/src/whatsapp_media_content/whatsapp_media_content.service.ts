import { Injectable } from '@nestjs/common';
import { CreateWhatsappMediaContentDto } from './dto/create-whatsapp_media_content.dto';
import { UpdateWhatsappMediaContentDto } from './dto/update-whatsapp_media_content.dto';

@Injectable()
export class WhatsappMediaContentService {
  create(createWhatsappMediaContentDto: CreateWhatsappMediaContentDto) {
    return 'This action adds a new whatsappMediaContent';
  }

  findAll() {
    return `This action returns all whatsappMediaContent`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsappMediaContent`;
  }

  update(id: number, updateWhatsappMediaContentDto: UpdateWhatsappMediaContentDto) {
    return `This action updates a #${id} whatsappMediaContent`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappMediaContent`;
  }
}
