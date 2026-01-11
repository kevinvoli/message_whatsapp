import { Injectable } from '@nestjs/common';
import { CreateWhatsappCommercialDto } from './dto/create-whatsapp-commercial.dto';
import { UpdateWhatsappCommercialDto } from './dto/update-whatsapp-commercial.dto';

@Injectable()
export class WhatsappCommercialService {
  create(createWhatsappCommercialDto: CreateWhatsappCommercialDto) {
    return 'This action adds a new whatsappCommercial';
  }

  findAll() {
    return `This action returns all whatsappCommercial`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsappCommercial`;
  }

  update(id: number, updateWhatsappCommercialDto: UpdateWhatsappCommercialDto) {
    return `This action updates a #${id} whatsappCommercial`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappCommercial`;
  }
}
