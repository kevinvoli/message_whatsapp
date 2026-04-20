import { IsEnum, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { FollowUpType } from '../entities/follow_up.entity';

export class CreateFollowUpDto {
  @IsOptional()
  @IsUUID()
  contact_id?: string;

  @IsOptional()
  @IsUUID()
  conversation_id?: string;

  @IsEnum(FollowUpType)
  @IsNotEmpty()
  type: FollowUpType;

  @IsISO8601()
  @IsNotEmpty()
  scheduled_at: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
