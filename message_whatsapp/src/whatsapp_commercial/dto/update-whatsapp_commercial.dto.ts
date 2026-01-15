import { IsEmail, IsOptional, } from 'class-validator';

export class UpdateWhatsappCommercialDto {
  @IsEmail()
  @IsOptional()
  email?: string;


}
