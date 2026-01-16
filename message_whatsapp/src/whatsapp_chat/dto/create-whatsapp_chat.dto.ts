import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
} from 'class-validator';

export enum WhatsappChatStatus {
  ACTIF = 'actif',
  EN_ATTENTE = 'en attente',
  FERME = 'fermé',
}

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

  @IsEnum(WhatsappChatStatus)
  @IsOptional()
  status?: WhatsappChatStatus;

  @IsString()
  @IsNotEmpty()
  type: string;

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

  @IsNumber()
  @IsOptional()
  unread_count?: number;

  @IsString()
  @IsOptional()
  unread_mention?: string;

  @IsString()
  @IsOptional()
  read_only?: string;

  @IsString()
  @IsOptional()
  not_spam?: string;

  @IsDateString()
  @IsOptional()
  last_activity_at?: Date;

  @IsString()
  @IsOptional()
  contact_client?: string;

  @IsString()
  @IsOptional()
  created_at?: string;

  @IsString()
  @IsOptional()
  updated_at?: string;
}
