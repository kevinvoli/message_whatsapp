import { IsString, IsNotEmpty } from 'class-validator';

export class CreateWhatsappMediaContentDto {
  @IsString()
  @IsNotEmpty()
  media_content_id: string;

  @IsString()
  @IsNotEmpty()
  message_content_id: string;

  @IsString()
  @IsNotEmpty()
  media_type: string;

  @IsString()
  @IsNotEmpty()
  whapi_media_id: string;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  mime_type: string;

  @IsString()
  @IsNotEmpty()
  file_name: string;

  @IsString()
  @IsNotEmpty()
  file_size: string;

  @IsString()
  @IsNotEmpty()
  sha256: string;

  @IsString()
  @IsNotEmpty()
  width: string;

  @IsString()
  @IsNotEmpty()
  height: string;

  @IsString()
  @IsNotEmpty()
  duration_seconds: string;

  @IsString()
  @IsNotEmpty()
  caption: string;

  @IsString()
  @IsNotEmpty()
  preview: string;

  @IsString()
  @IsNotEmpty()
  view_once: string;
}
