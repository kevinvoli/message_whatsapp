import { Injectable } from '@nestjs/common';
import { CreateWhatsappTextContentDto } from './dto/create-whatsapp_text_content.dto';
import { UpdateWhatsappTextContentDto } from './dto/update-whatsapp_text_content.dto';

@Injectable()
export class WhatsappTextContentService {
  create(createWhatsappTextContentDto: CreateWhatsappTextContentDto) {
    return 'This action adds a new whatsappTextContent';
  }

  findAll() {
    return `This action returns all whatsappTextContent`;
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappTextContent`;
  }

  update(id: string, updateWhatsappTextContentDto: UpdateWhatsappTextContentDto) {
    return `This action updates a #${id} whatsappTextContent`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappTextContent`;
  }
}
