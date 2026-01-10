import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappLastMessageDto } from './create-whatsapp_last_message.dto';

export class UpdateWhatsappLastMessageDto extends PartialType(CreateWhatsappLastMessageDto) {
  id: number;
}
