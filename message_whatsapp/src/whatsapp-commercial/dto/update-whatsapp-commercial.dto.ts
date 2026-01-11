import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappCommercialDto } from './create-whatsapp-commercial.dto';

export class UpdateWhatsappCommercialDto extends PartialType(CreateWhatsappCommercialDto) {
  id: number;
}
