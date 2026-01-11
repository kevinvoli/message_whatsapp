import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappChatLabelDto } from './create-whatsapp_chat_label.dto';

export class UpdateWhatsappChatLabelDto extends PartialType(CreateWhatsappChatLabelDto) {
  id: string;
}
