import { Injectable } from '@nestjs/common';
import { CreateWhatsappMessageContentDto } from './dto/create-whatsapp_message_content.dto';
import { UpdateWhatsappMessageContentDto } from './dto/update-whatsapp_message_content.dto';

@Injectable()
export class WhatsappMessageContentService {
  create(createWhatsappMessageContentDto: CreateWhatsappMessageContentDto) {
    return 'This action adds a new whatsappMessageContent';
  }

  findAll() {
    return `This action returns all whatsappMessageContent`;
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappMessageContent`;
  }

  update(id: string, updateWhatsappMessageContentDto: UpdateWhatsappMessageContentDto) {
    return `This action updates a #${id} whatsappMessageContent`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappMessageContent`;
  }
}
