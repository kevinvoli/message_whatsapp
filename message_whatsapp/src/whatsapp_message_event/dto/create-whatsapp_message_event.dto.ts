import { IsString, IsNotEmpty, IsEnum, IsJSON } from 'class-validator';

export class CreateWhatsappMessageEventDto {
  @IsString()
  @IsNotEmpty()
  message_event_id: string;

  @IsString()
  @IsNotEmpty()
  message_id: string;

  @IsEnum(['edited', 'reaction', 'status', 'poll_vote', 'system'])
  @IsNotEmpty()
  event_type: 'edited' | 'reaction' | 'status' | 'poll_vote' | 'system';

  @IsString()
  @IsNotEmpty()
  created_at: string;

  @IsJSON()
  @IsNotEmpty()
  raw_payload: string;
}
