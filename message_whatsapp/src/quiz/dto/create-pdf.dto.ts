import { IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreatePdfDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsBoolean()
  allowInlineView: boolean;

  @IsBoolean()
  isPermanent: boolean;

  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @IsOptional()
  @IsDateString()
  availableUntil?: string;
}
