import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappInteractiveContentDto } from './create-whatsapp_interactive_content.dto';

export class UpdateWhatsappInteractiveContentDto extends PartialType(
  CreateWhatsappInteractiveContentDto,
) {}
