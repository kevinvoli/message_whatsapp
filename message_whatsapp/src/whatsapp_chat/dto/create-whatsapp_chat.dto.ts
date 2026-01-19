import { IsString, IsOptional, IsEnum, IsBoolean, IsNumber, IsDate } from 'class-validator';
import { WhatsappChatStatus } from '../entities/whatsapp_chat.entity';

export class CreateWhatsappChatDto {
  @IsString()
  @IsOptional()
  commercial_id?: string | null;

  @IsString()
  chat_id: string;

  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsString()
  @IsOptional()
  chat_pic?: string;

  @IsString()
  @IsOptional()
  chat_pic_full?: string;

  @IsBoolean()
  @IsOptional()
  is_pinned?: boolean;

  @IsBoolean()
  @IsOptional()
  is_muted?: boolean;

  @IsDate()
  @IsOptional()
  mute_until?: Date | null;

  @IsBoolean()
  @IsOptional()
  is_archived?: boolean;

  @IsNumber()
  @IsOptional()
  unread_count?: number;

  @IsBoolean()
  @IsOptional()
  unread_mention?: boolean;

  @IsBoolean()
  @IsOptional()
  read_only?: boolean;

  @IsBoolean()
  @IsOptional()
  not_spam?: boolean;

  @IsDate()
  @IsOptional()
  last_activity_at?: Date;

  @IsString()
  contact_client: string;

  @IsEnum(WhatsappChatStatus)
  @IsOptional()
  status?: WhatsappChatStatus;
}
