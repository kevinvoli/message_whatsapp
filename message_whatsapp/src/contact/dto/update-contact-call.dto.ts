import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { CallStatus } from '../entities/contact.entity';

export class UpdateContactCallDto {
  @IsEnum(CallStatus)
  call_status: CallStatus;

  @IsOptional()
  @IsString()
  call_notes?: string;

  /** Résultat de l'appel (ticket F-04) */
  @IsOptional()
  @IsString()
  outcome?: string;

  /** Durée en secondes (ticket F-04) */
  @IsOptional()
  @IsInt()
  duration_sec?: number;
}
