import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateWhatsappCommercialDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @IsString()
  poste_id: string;
}
