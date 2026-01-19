import { IsString, IsNotEmpty, IsInt, IsUrl } from 'class-validator';

export class CreateWhatsappErrorDto {
  @IsString()
  @IsNotEmpty()
  error_id: string;

  @IsInt()
  @IsNotEmpty()
  code: number;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsNotEmpty()
  details: string;

  @IsUrl()
  @IsNotEmpty()
  href: string;

  @IsString()
  @IsNotEmpty()
  support: string;
}
