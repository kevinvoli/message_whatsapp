import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateCannedResponseDto {
  @IsString()
  tenant_id: string;

  @IsOptional()
  @IsString()
  poste_id?: string | null;

  @IsString()
  shortcode: string;

  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
