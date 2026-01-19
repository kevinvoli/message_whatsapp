import { IsString, IsNotEmpty } from 'class-validator';

export class CreateWhatsappTextContentDto {
  @IsString()
  @IsNotEmpty()
  text_content_id: string;

  @IsString()
  @IsNotEmpty()
  message_content_id: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsString()
  @IsNotEmpty()
  view_once: string;
}
