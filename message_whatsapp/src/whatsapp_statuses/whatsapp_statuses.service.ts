import { Injectable } from '@nestjs/common';
import { CreateWhatsappStatusDto } from './dto/create-whatsapp_status.dto';
import { UpdateWhatsappStatusDto } from './dto/update-whatsapp_status.dto';

@Injectable()
export class WhatsappStatusesService {
  create(createWhatsappStatusDto: CreateWhatsappStatusDto) {
    return 'This action adds a new whatsappStatus';
  }

  findAll() {
    return `This action returns all whatsappStatuses`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsappStatus`;
  }

  update(id: number, updateWhatsappStatusDto: UpdateWhatsappStatusDto) {
    return `This action updates a #${id} whatsappStatus`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappStatus`;
  }
}
