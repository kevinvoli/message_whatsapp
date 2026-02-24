import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateDispatchSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  no_reply_reinject_interval_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  read_only_check_interval_minutes?: number;

  @IsOptional()
  @IsString()
  offline_reinject_cron?: string;
}
