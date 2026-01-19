import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappAgentDto } from './create-whatsapp_agent.dto';

export class UpdateWhatsappAgentDto extends PartialType(
  CreateWhatsappAgentDto,
) {}
