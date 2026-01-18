import { IsString, IsOptional, IsEnum, IsBoolean, IsNumber, IsDateString } from 'class-validator';
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

  @IsDateString()
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

  @IsDateString()
  @IsOptional()
  last_activity_at?: Date;

  @IsString()
  contact_client: string;

  @IsDateString()
  created_at: Date;

  @IsDateString()
  updated_at: Date;

  @IsEnum(WhatsappChatStatus)
  @IsOptional()
  status?: WhatsappChatStatus;
}
