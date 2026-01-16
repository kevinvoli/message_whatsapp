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
}