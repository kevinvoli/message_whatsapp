import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappLocationContentDto } from './create-whatsapp_location_content.dto';

export class UpdateWhatsappLocationContentDto extends PartialType(CreateWhatsappLocationContentDto) {
  id: string;
}
