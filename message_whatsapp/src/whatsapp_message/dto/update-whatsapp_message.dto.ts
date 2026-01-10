import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappMessageDto } from './create-whatsapp_message.dto';

export class UpdateWhatsappMessageDto extends PartialType(CreateWhatsappMessageDto) {
  id: number;
}
