import { FieldType } from '../entities/contact-field-definition.entity';
import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  IsEnum,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFieldDefinitionDto {
  @IsString()
  tenant_id: string;

  @IsString()
  name: string;

  @IsString()
  field_key: string;

  @IsOptional()
  @IsEnum(['text', 'number', 'date', 'boolean', 'select', 'multiselect'])
  field_type?: FieldType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[] | null;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsNumber()
  position?: number;
}

export class UpdateFieldDefinitionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[] | null;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsNumber()
  position?: number;
}

class FieldValueItemDto {
  @IsString()
  field_key: string;

  value: string | number | boolean | string[] | null;
}

export class SetContactFieldValuesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldValueItemDto)
  values: FieldValueItemDto[];
}
