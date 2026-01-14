import { Injectable } from '@nestjs/common';
import { CreateWhatsappInteractiveContentDto } from './dto/create-whatsapp_interactive_content.dto';
import { UpdateWhatsappInteractiveContentDto } from './dto/update-whatsapp_interactive_content.dto';

@Injectable()
export class WhatsappInteractiveContentService {
  create(
    createWhatsappInteractiveContentDto: CreateWhatsappInteractiveContentDto,
  ) {
    return 'This action adds a new whatsappInteractiveContent';
  }

  findAll() {
    return `This action returns all whatsappInteractiveContent`;
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappInteractiveContent`;
  }

  update(
    id: string,
    updateWhatsappInteractiveContentDto: UpdateWhatsappInteractiveContentDto,
  ) {
    return `This action updates a #${id} whatsappInteractiveContent`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappInteractiveContent`;
  }
}
