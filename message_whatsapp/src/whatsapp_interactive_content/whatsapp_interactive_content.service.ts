import { Injectable } from '@nestjs/common';
import { CreateWhatsappInteractiveContentDto } from './dto/create-whatsapp_interactive_content.dto';
import { UpdateWhatsappInteractiveContentDto } from './dto/update-whatsapp_interactive_content.dto';

@Injectable()
export class WhatsappInteractiveContentService {
  create(createWhatsappInteractiveContentDto: CreateWhatsappInteractiveContentDto) {
    return 'This action adds a new whatsappInteractiveContent';
  }

  findAll() {
    return `This action returns all whatsappInteractiveContent`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsappInteractiveContent`;
  }

  update(id: number, updateWhatsappInteractiveContentDto: UpdateWhatsappInteractiveContentDto) {
    return `This action updates a #${id} whatsappInteractiveContent`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappInteractiveContent`;
  }
}
