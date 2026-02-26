import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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

  @IsOptional()
  @IsBoolean()
  auto_message_enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  auto_message_delay_min_seconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  auto_message_delay_max_seconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  auto_message_max_steps?: number;
}
