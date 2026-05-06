import { TemplateCategory, TemplateHeaderType } from '../entities/whatsapp-template.entity';
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
} from 'class-validator';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  channel_id?: string | null;

  @IsOptional()
  @IsString()
  name?: string;

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

  @IsOptional()
  @IsString()
  body_text?: string;

  @IsOptional()
  @IsString()
  footer_text?: string | null;

  @IsOptional()
  @IsArray()
  parameters?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsArray()
  buttons?: Record<string, unknown>[] | null;

  @IsOptional()
  @IsString()
  base_model?: string | null;

  @IsOptional()
  @IsString()
  header_text?: string | null;

  @IsOptional()
  @IsString()
  header_example?: string | null;

  @IsOptional()
  @IsArray()
  body_example_variables?: string[] | null;
}
