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

  findOne(id: number) {
    return `This action returns a #${id} whatsappContact`;
  }

  update(id: number, updateWhatsappContactDto: UpdateWhatsappContactDto) {
    return `This action updates a #${id} whatsappContact`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappContact`;
  }
}
