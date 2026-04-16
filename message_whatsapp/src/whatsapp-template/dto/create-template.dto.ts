import { TemplateCategory, TemplateHeaderType } from '../entities/whatsapp-template.entity';
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsObject,
} from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  tenant_id: string;

  @IsOptional()
  @IsString()
  channel_id?: string | null;

  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category?: TemplateCategory;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'])
  header_type?: TemplateHeaderType | null;

  @IsOptional()
  @IsString()
  header_content?: string | null;

  @IsString()
  body_text: string;

  @IsOptional()
  @IsString()
  footer_text?: string | null;

  @IsOptional()
  @IsArray()
  parameters?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsArray()
  buttons?: Record<string, unknown>[] | null;
}
