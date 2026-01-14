import { IsString, IsNotEmpty, IsDate, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWhatsappConversationDto {
  @IsString()
  @IsNotEmpty()
  conversation_id: string;

  @IsString()
  @IsNotEmpty()
  customer_id: string;

  @IsString()
  @IsNotEmpty()
  assigned_agent_id: string;

  @IsString()
  @IsNotEmpty()
  chat_id: string;

  @IsEnum(['open', 'close'])
  @IsNotEmpty()
  status: 'open' | 'close';

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  started_at: Date;

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  closed_at: Date;
}
