import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateWhatsappMessageDto {
  @IsString()
  @IsNotEmpty()
  chat_id: string;

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsNotEmpty()
  poste_id: string;

  @IsString()
  @IsNotEmpty()
  channel_id: string;

  @IsOptional()
  @IsNumber()
  timestamp?: number;

  /** DB UUID of the message to quote (reply feature) */
  @IsOptional()
  @IsString()
  quotedMessageId?: string;
}
