import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateWhatsappChatDto {
  @IsString()
  @IsOptional()
  commercial_id: string | null;

  @IsString()
  @IsNotEmpty()
  chat_id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  chat_pic: string;

  @IsString()
  @IsNotEmpty()
  chat_pic_full: string;

  @IsString()
  @IsNotEmpty()
  is_pinned: string;

  @IsString()
  @IsNotEmpty()
  is_muted: string;

  @IsString()
  @IsNotEmpty()
  mute_until: string;

  @IsString()
  @IsNotEmpty()
  is_archived: string;

  @IsString()
  @IsNotEmpty()
  unread_count: string;

  @IsString()
  @IsNotEmpty()
  unread_mention: string;

  @IsString()
  @IsNotEmpty()
  read_only: string;

  @IsString()
  @IsNotEmpty()
  not_spam: string;

  @IsString()
  @IsNotEmpty()
  last_activity_at: string;

  @IsString()
  @IsNotEmpty()
  contact_client: string;

  @IsString()
  @IsNotEmpty()
  created_at: string;

  @IsString()
  @IsNotEmpty()
  updated_at: string;

   conversation_id?: string;

  customer_id?: string;

  assigned_agent_id?: string;

  status?: 'open' | 'close';
 
  started_at?: Date;

  closed_at?: Date;
}
