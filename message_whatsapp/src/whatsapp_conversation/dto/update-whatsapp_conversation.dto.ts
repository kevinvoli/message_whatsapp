import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappConversationDto } from './create-whatsapp_conversation.dto';

export class UpdateWhatsappConversationDto extends PartialType(
  CreateWhatsappConversationDto,
) {}
