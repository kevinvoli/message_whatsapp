import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappErrorDto } from './create-whatsapp_error.dto';

export class UpdateWhatsappErrorDto extends PartialType(CreateWhatsappErrorDto) {
  id: string;
}
