import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateDispatchSettingsDto {
  @IsOptional()
  @IsIn(['least_loaded', 'round_robin'])
  queue_mode?: 'least_loaded' | 'round_robin';

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

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  readOnlyMaxMessages?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  maxReadMessagesPerMinute?: number;

  @IsOptional()
  @IsBoolean()
  idleDisconnectEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  idleDisconnectMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  readCooldownSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  idleWarningSeconds?: number;
}