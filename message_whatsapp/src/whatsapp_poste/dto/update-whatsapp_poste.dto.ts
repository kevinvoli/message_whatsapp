import { PartialType } from '@nestjs/swagger';
import { CreateWhatsappPosteDto } from './create-whatsapp_poste.dto';

export class UpdateWhatsappPosteDto extends PartialType(CreateWhatsappPosteDto) {}
