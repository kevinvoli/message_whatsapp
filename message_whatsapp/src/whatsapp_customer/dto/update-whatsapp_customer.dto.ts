import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappCustomerDto } from './create-whatsapp_customer.dto';

export class UpdateWhatsappCustomerDto extends PartialType(CreateWhatsappCustomerDto) {
  id: number;
}
