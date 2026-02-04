import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateWhatsappCommercialDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isConnected?: boolean;

  @IsOptional()
  @IsString()
  poste_id?: string;

  @IsOptional()
  @IsString()
  role?: string;
}