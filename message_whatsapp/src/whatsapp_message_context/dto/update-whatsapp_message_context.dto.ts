import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappMessageContextDto } from './create-whatsapp_message_context.dto';

export class UpdateWhatsappMessageContextDto extends PartialType(
  CreateWhatsappMessageContextDto,
) {}
