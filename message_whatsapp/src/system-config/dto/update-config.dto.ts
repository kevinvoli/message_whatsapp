import { IsString, IsNotEmpty, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateConfigDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  value: string;
}

export class BulkUpdateConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateConfigDto)
  entries: UpdateConfigDto[];
}
