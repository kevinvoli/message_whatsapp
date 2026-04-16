import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBroadcastDto {
  @IsString()
  tenant_id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  template_id?: string;

  @IsOptional()
  @IsString()
  channel_id?: string;

  @IsOptional()
  @IsString()
  scheduled_at?: string | null;

  @IsOptional()
  @IsString()
  created_by?: string | null;
}

class RecipientItemDto {
  @IsString()
  phone: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string> | null;
}

export class AddRecipientsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientItemDto)
  recipients: RecipientItemDto[];
}
