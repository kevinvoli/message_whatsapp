import { IsString, IsNotEmpty } from 'class-validator';

export class CreateWhatsappMessageContextDto {
  @IsString()
  @IsNotEmpty()
  message_context_id: string;

  @IsString()
  @IsNotEmpty()
  message_id: string;

  @IsString()
  @IsNotEmpty()
  forwarded: string;

  @IsString()
  @IsNotEmpty()
  forwarding_score: string;

  @IsString()
  @IsNotEmpty()
  quoted_message_id: string;

  @IsString()
  @IsNotEmpty()
  quoted_author: string;

  @IsString()
  @IsNotEmpty()
  ephemeral_duration: string;
}
