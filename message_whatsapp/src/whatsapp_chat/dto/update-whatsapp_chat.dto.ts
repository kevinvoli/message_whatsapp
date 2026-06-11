import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { WhatsappChatStatus } from '../entities/whatsapp_chat.entity';

export class UpdateWhatsappChatDto {
  @IsOptional()
  @IsBoolean()
  read_only?: boolean;

  @IsOptional()
  @IsEnum(WhatsappChatStatus)
  status?: WhatsappChatStatus;
}
