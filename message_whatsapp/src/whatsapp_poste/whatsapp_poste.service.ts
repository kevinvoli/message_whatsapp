import { Injectable } from '@nestjs/common';
import { CreateWhatsappPosteDto } from './dto/create-whatsapp_poste.dto';
import { UpdateWhatsappPosteDto } from './dto/update-whatsapp_poste.dto';

@Injectable()
export class WhatsappPosteService {
  create(createWhatsappPosteDto: CreateWhatsappPosteDto) {
    return 'This action adds a new whatsappPoste';
  }

  findAll() {
    return `This action returns all whatsappPoste`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsappPoste`;
  }

  update(id: number, updateWhatsappPosteDto: UpdateWhatsappPosteDto) {
    return `This action updates a #${id} whatsappPoste`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappPoste`;
  }
}
