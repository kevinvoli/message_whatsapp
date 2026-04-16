import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateCannedResponseDto {
  @IsOptional()
  @IsString()
  shortcode?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsString()
  poste_id?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
