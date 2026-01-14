import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappStatusDto } from './create-whatsapp_status.dto';

export class UpdateWhatsappStatusDto extends PartialType(
  CreateWhatsappStatusDto,
) {}
