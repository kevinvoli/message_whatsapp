import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappTextContentDto } from './create-whatsapp_text_content.dto';

export class UpdateWhatsappTextContentDto extends PartialType(CreateWhatsappTextContentDto) {
  id: string;
}
