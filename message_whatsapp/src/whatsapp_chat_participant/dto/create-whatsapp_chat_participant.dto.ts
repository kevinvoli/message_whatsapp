import { IsString, IsNotEmpty, IsPhoneNumber, IsEnum } from 'class-validator';

export class CreateWhatsappChatParticipantDto {
  @IsString()
  @IsNotEmpty()
  chat_participant_id: string;

  @IsString()
  @IsNotEmpty()
  chat_id: string;

  @IsPhoneNumber(null)
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(['admin', 'member'])
  @IsNotEmpty()
  role: 'admin' | 'member';

  @IsString()
  @IsNotEmpty()
  joined_at: string;
}
