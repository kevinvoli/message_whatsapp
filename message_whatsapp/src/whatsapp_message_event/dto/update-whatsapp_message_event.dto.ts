import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappMessageEventDto } from './create-whatsapp_message_event.dto';

export class UpdateWhatsappMessageEventDto extends PartialType(
  CreateWhatsappMessageEventDto,
) {}
