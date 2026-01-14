import { IsString, IsNotEmpty } from 'class-validator';

export class CreateWhatsappMessageContentDto {
  @IsString()
  @IsNotEmpty()
  message_content_id: string;

  @IsString()
  @IsNotEmpty()
  message_id: string;

  @IsString()
  @IsNotEmpty()
  content_type: string;
}
