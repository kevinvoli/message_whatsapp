import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CallStatus } from '../entities/contact.entity';

export class UpdateContactCallDto {
  @IsEnum(CallStatus)
  call_status: CallStatus;

  @IsOptional()
  @IsString()
  call_notes?: string;
}
