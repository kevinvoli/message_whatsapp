import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappPosteDto } from './create-whatsapp_poste.dto';

export class UpdateWhatsappPosteDto extends PartialType(
  CreateWhatsappPosteDto,
) {}
