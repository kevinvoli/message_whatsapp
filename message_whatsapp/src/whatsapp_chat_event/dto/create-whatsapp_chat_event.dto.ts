import { IsString, IsNotEmpty, IsJSON } from 'class-validator';

export class CreateWhatsappChatEventDto {
  @IsString()
  @IsNotEmpty()
  chat_event_id: string;

  @IsString()
  @IsNotEmpty()
  chat_id: string;

  @IsString()
  @IsNotEmpty()
  event_type: string;

  @IsString()
  @IsNotEmpty()
  value: string;

  @IsString()
  @IsNotEmpty()
  timestamp: string;

  @IsJSON()
  @IsNotEmpty()
  raw_payload: string;
}
