import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappMediaDto } from './create-whatsapp_media.dto';

export class UpdateWhatsappMediaDto extends PartialType(
  CreateWhatsappMediaDto,
) {}
