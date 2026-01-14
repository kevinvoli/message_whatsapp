import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export class CreateWhatsappInteractiveContentDto {
  @IsString()
  @IsNotEmpty()
  interactive_content_id: string;

  @IsString()
  @IsNotEmpty()
  message_content_id: string;

  @IsEnum(['button', 'list', 'product'])
  @IsNotEmpty()
  interactive_type: 'button' | 'list' | 'product';

  @IsString()
  @IsNotEmpty()
  header_text: string;

  @IsString()
  @IsNotEmpty()
  body_text: string;

  @IsString()
  @IsNotEmpty()
  footer_text: string;
}
