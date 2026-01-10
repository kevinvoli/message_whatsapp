import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappMessageContentDto } from './create-whatsapp_message_content.dto';

export class UpdateWhatsappMessageContentDto extends PartialType(CreateWhatsappMessageContentDto) {
  id: number;
}
