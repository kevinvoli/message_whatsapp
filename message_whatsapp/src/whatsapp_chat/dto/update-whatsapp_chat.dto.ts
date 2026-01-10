import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappChatDto } from './create-whatsapp_chat.dto';

export class UpdateWhatsappChatDto extends PartialType(CreateWhatsappChatDto) {
  id: number;
}
