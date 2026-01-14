import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWhatsappCommercialDto {
  @IsEmail()
  @IsOptional()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsEnum(['ADMIN', 'COMMERCIAL'])
  @IsNotEmpty()
  role: string;

  @IsString()
  @IsOptional()
  passwordResetToken?: string | null;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  passwordResetExpires?: Date | null;

  @IsBoolean()
  @IsOptional()
  isConnected: boolean;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  lastConnectionAt: Date;
}
