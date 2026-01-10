import { Injectable } from '@nestjs/common';
import { WhatsappMessage } from './entities/whatsapp_message.entity';

@Injectable()
export class WhatsappMessageService {
  create(
    
      createWhatsappMessageDto: Partial<WhatsappMessage>,
      direction: 'IN',
      type,
      content,
      timestamp,
    ): string {

    return 'This action adds a new whatsappMessage';
  }

  findAll() {
    
    return `This action returns all whatsappMessage`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsappMessage`;
  }

  update(id: number, updateWhatsappMessageDto: Partial<WhatsappMessage>) {
    return `This action updates a #${id} whatsappMessage`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappMessage`;
  }
}
