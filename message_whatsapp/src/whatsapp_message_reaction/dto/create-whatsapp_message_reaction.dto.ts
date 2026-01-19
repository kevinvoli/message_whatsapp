import { IsString, IsNotEmpty } from 'class-validator';

export class CreateWhatsappMessageReactionDto {
  @IsString()
  @IsNotEmpty()
  message_reaction: string;

  @IsString()
  @IsNotEmpty()
  message_id: string;

  @IsString()
  @IsNotEmpty()
  emoji: string;

  @IsString()
  @IsNotEmpty()
  author: string;

  @IsString()
  @IsNotEmpty()
  count: string;

  @IsString()
  @IsNotEmpty()
  unread: string;

  @IsString()
  @IsNotEmpty()
  reacted_at: string;
}
