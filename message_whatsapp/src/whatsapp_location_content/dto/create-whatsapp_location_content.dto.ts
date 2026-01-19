import { IsString, IsNotEmpty, IsUrl } from 'class-validator';

export class CreateWhatsappLocationContentDto {
  @IsString()
  @IsNotEmpty()
  location_content_id: string;

  @IsString()
  @IsNotEmpty()
  message_content_id: string;

  @IsString()
  @IsNotEmpty()
  latitude: string;

  @IsString()
  @IsNotEmpty()
  longitude: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUrl()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  accuracy: string;

  @IsString()
  @IsNotEmpty()
  speed: string;

  @IsString()
  @IsNotEmpty()
  degrees: string;
}
