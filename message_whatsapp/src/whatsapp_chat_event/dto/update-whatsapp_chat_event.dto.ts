import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappChatEventDto } from './create-whatsapp_chat_event.dto';

export class UpdateWhatsappChatEventDto extends PartialType(
  CreateWhatsappChatEventDto,
) {}
