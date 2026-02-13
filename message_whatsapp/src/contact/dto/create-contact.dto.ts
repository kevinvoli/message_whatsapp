import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CallStatus, Priority } from '../entities/contact.entity';

export class CreateContactDto {
  @IsString()
  @MaxLength(100)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  chat_id?: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsEnum(CallStatus)
  call_status?: CallStatus;

  @IsOptional()
  @IsString()
  last_call_outcome?: string;

  @IsOptional()
  @IsString()
  call_notes?: string;

  @IsOptional()
  @IsEnum(['nouveau', 'prospect', 'client', 'perdu'])
  conversion_status?: 'nouveau' | 'prospect' | 'client' | 'perdu';

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}
