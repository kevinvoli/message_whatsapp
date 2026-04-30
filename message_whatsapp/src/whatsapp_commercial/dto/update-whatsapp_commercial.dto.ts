import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateWhatsappCommercialDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password?: string;

  @IsOptional()
  @IsString()
  poste_id?: string | null;

  @IsOptional()
  @IsBoolean()
  isConnected?: boolean;

  @IsOptional()
  @IsBoolean()
  allowOutsideHours?: boolean;
}
