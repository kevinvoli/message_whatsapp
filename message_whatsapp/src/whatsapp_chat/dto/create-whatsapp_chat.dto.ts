import { IsString, IsOptional, IsEnum } from 'class-validator';
import { WhatsappChatStatus } from '../entities/whatsapp_chat.entity';

export class CreateWhatsappChatDto {
  @IsString()
  @IsOptional()
  commercial_id?: string | null;

  @IsString()
  @IsOptional()
  chat_id?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  chat_pic?: string;

  @IsString()
  @IsOptional()
  chat_pic_full?: string;

  @IsString()
  @IsOptional()
  is_pinned?: string;

  @IsString()
  @IsOptional()
  is_muted?: string;

  @IsString()
  @IsOptional()
  mute_until?: string;

  @IsString()
  @IsOptional()
  is_archived?: string;

  @IsString()
  @IsOptional()
  unread_count?: string;

  @IsString()
  @IsOptional()
  unread_mention?: string;

  @IsString()
  @IsOptional()
  read_only?: string;

  @IsString()
  @IsOptional()
  not_spam?: string;

  @IsString()
  @IsOptional()
  last_activity_at?: string;

  @IsString()
  @IsOptional()
  contact_client?: string;

  @IsString()
  @IsOptional()
  created_at?: string;

  @IsString()
  @IsOptional()
  updated_at?: string;

  @IsString()
  @IsOptional()
  conversation_id?: string;

  @IsString()
  @IsOptional()
  customer_id?: string;

  @IsString()
  @IsOptional()
  assigned_agent_id?: string;

  @IsEnum(WhatsappChatStatus)
  @IsOptional()
  status?: WhatsappChatStatus;
 
  @IsString()
  @IsOptional()
  started_at?: string;

  @IsOptional()
  closed_at?: Date;
}
