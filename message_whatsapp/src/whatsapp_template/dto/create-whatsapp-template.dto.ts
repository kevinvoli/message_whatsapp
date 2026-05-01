import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { WhatsappTemplateStatus } from '../entities/whatsapp_template.entity';

export class CreateWhatsappTemplateDto {
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsEnum(WhatsappTemplateStatus)
  @IsOptional()
  status?: WhatsappTemplateStatus;

  @IsOptional()
  components?: any;

  @IsString()
  @IsOptional()
  externalId?: string;
}
