import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateWhatsappMessageDto {
  @IsOptional()
  @IsString()
  id: string;

  @IsString()
  message_id?: string

  @IsString()
  external_id?: string

  conversation_id?: string
commercial_id: string
  direction: 'IN' | 'OUT'

  @IsBoolean()
  from_me?: boolean;



  @IsString()
  type?: string;

   @IsString()
  chat_id: string;

  @IsNumber()
  timestamp: number;

   @IsString()
  source: string;

  @IsOptional()
  @IsNumber()
  device_id: number;

   @IsString()
  chat_name: string;

   @IsString()
  from: string;

   @IsString()
  from_name: string;

   @IsString()
  text?: string;

  
  sender_phone: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
 
}
