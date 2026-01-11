import { Injectable } from '@nestjs/common';
import { CreateWhatsappContactDto } from './dto/create-whatsapp_contact.dto';
import { UpdateWhatsappContactDto } from './dto/update-whatsapp_contact.dto';

@Injectable()
export class WhatsappContactsService {
  create(createWhatsappContactDto: CreateWhatsappContactDto) {
    return 'This action adds a new whatsappContact';
  }

  findAll() {
    return `This action returns all whatsappContacts`;
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappContact`;
  }

  update(id: string, updateWhatsappContactDto: UpdateWhatsappContactDto) {
    return `This action updates a #${id} whatsappContact`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappContact`;
  }
}
