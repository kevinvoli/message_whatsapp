import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappMessageReactionDto } from './create-whatsapp_message_reaction.dto';

export class UpdateWhatsappMessageReactionDto extends PartialType(
  CreateWhatsappMessageReactionDto,
) {}
