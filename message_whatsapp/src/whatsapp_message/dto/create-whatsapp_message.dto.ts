import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsBoolean,
  IsDate,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MessageDirection,
  WhatsappMessageStatus,
} from '../entities/whatsapp_message.entity';

export class CreateWhatsappMessageDto {
  @IsString()
  @IsNotEmpty()
  message_id: string;

  @IsString()
  @IsNotEmpty()
  external_id: string;

  @IsString()
  @IsNotEmpty()
  chat_id: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsOptional()
  conversation_id: string | null;

  @IsString()
  @IsOptional()
  commercial_id: string | null;

  @IsString()
  @IsOptional()
  text: string | null;

  @IsEnum(MessageDirection)
  @IsNotEmpty()
  direction: MessageDirection;

  @IsBoolean()
  @IsNotEmpty()
  from_me: boolean;

  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  from_name: string;

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  timestamp: Date;

  @IsEnum(WhatsappMessageStatus)
  @IsNotEmpty()
  status: WhatsappMessageStatus;

  @IsString()
  @IsNotEmpty()
  source: string;
}
