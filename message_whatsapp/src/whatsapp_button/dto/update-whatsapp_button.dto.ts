import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappButtonDto } from './create-whatsapp_button.dto';

export class UpdateWhatsappButtonDto extends PartialType(CreateWhatsappButtonDto) {
  id: number;
}
