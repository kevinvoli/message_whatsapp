import { Injectable } from '@nestjs/common';
import { CreateWhatsappCustomerDto } from './dto/create-whatsapp_customer.dto';
import { UpdateWhatsappCustomerDto } from './dto/update-whatsapp_customer.dto';

@Injectable()
export class WhatsappCustomerService {
  create(createWhatsappCustomerDto: CreateWhatsappCustomerDto) {
    return 'This action adds a new whatsappCustomer';
  }

  findAll() {
    return `This action returns all whatsappCustomer`;
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappCustomer`;
  }

  update(id: string, updateWhatsappCustomerDto: UpdateWhatsappCustomerDto) {
    return `This action updates a #${id} whatsappCustomer`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappCustomer`;
  }
}
