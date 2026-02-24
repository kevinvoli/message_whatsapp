import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CallStatus } from 'src/contact/entities/contact.entity';
import { CallOutcome } from '../entities/call_log.entity';

export class CreateCallLogDto {
  @IsString()
  contact_id: string;

  @IsString()
  commercial_id: string;

  @IsString()
  commercial_name: string;

  @IsEnum(CallStatus)
  call_status: CallStatus;

  @IsOptional()
  @IsEnum(CallOutcome)
  outcome?: CallOutcome;

  @IsOptional()
  @IsInt()
  duration_sec?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  called_at?: Date;
}
