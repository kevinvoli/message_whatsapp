import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappCommercialDto } from './create-whatsapp_commercial.dto';

export class UpdateWhatsappCommercialDto extends PartialType(
  CreateWhatsappCommercialDto,
) {}
