import { IsString, IsOptional, IsEnum } from 'class-validator';
import { OptOutReason } from '../entities/gdpr-optout.entity';

export class RegisterOptOutDto {
  @IsString()
  tenant_id: string;

  @IsString()
  phone_number: string;

  @IsOptional()
  @IsEnum(OptOutReason)
  reason?: OptOutReason;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  registered_by?: string | null;
}
