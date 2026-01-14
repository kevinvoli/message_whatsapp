import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappMediaContentDto } from './create-whatsapp_media_content.dto';

export class UpdateWhatsappMediaContentDto extends PartialType(
  CreateWhatsappMediaContentDto,
) {}
