import { IsString, IsOptional, IsEnum, IsBoolean, IsNumber, IsDateString } from 'class-validator';
import { WhatsappChatStatus } from '../entities/whatsapp_chat.entity';

export class CreateWhatsappChatDto {
  @IsString()
  @IsOptional()
  commercialId?: string | null;

  @IsString()
  chatId: string;

  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsString()
  @IsOptional()
  chatPic?: string;

  @IsString()
  @IsOptional()
  chatPicFull?: string;

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;

  @IsBoolean()
  @IsOptional()
  isMuted?: boolean;

  @IsDateString()
  @IsOptional()
  muteUntil?: Date | null;

  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;

  @IsNumber()
  @IsOptional()
  unreadCount?: number;

  @IsBoolean()
  @IsOptional()
  unreadMention?: boolean;

  @IsBoolean()
  @IsOptional()
  readOnly?: boolean;

  @IsBoolean()
  @IsOptional()
  notSpam?: boolean;

  @IsDateString()
  @IsOptional()
  lastActivityAt?: Date;

  @IsString()
  contactClient: string;

  @IsDateString()
  createdAt: Date;

  @IsDateString()
  updatedAt: Date;

  @IsEnum(WhatsappChatStatus)
  @IsOptional()
  status?: WhatsappChatStatus;
}
