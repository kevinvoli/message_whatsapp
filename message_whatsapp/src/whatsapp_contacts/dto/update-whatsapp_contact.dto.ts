import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappContactDto } from './create-whatsapp_contact.dto';

export class UpdateWhatsappContactDto extends PartialType(CreateWhatsappContactDto) {
  id: string;
}
