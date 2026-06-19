import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class UpdatePdfDto {
  @IsOptional()
  @IsBoolean()
  allowInlineView?: boolean;

  @IsOptional()
  @IsBoolean()
  isPermanent?: boolean;

  @IsOptional()
  @IsDateString()
  availableFrom?: string | null;

  @IsOptional()
  @IsDateString()
  availableUntil?: string | null;
}
