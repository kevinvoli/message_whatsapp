import { IsString, IsNotEmpty, IsUrl } from 'class-validator';

export class CreateWhatsappButtonDto {
  @IsString()
  @IsNotEmpty()
  button_id: string;

  @IsString()
  @IsNotEmpty()
  interactive_content_id: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  payload: string;

  @IsUrl()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  phone_number: string;
}
