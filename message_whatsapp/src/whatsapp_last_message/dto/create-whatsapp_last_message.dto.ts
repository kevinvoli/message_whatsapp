import { IsString, IsNotEmpty, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWhatsappLastMessageDto {
  @IsString()
  @IsNotEmpty()
  last_message_id: string;

  @IsString()
  @IsNotEmpty()
  chat_id: string;

  @IsString()
  @IsNotEmpty()
  message_id: string;

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  timestamp: Date;
}
