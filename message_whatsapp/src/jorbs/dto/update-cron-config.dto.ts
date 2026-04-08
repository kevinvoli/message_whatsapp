import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateCronConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalMinutes?: number;

  @IsOptional()
  @IsString()
  cronExpression?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ttlDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  delayMinSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  delayMaxSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxSteps?: number;

  // ─── Seuils triggers ─────────────────────────────────────────────────────

  @IsOptional()
  @IsInt()
  @Min(1)
  noResponseThresholdMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  queueWaitThresholdMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  inactivityThresholdMinutes?: number;

  // ─── Filtres ─────────────────────────────────────────────────────────────

  @IsOptional()
  @IsBoolean()
  applyToReadOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  applyToClosed?: boolean;

  // ─── Plage horaire (auto-message-master) ──────────────────────────────────

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(22)
  activeHourStart?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(23)
  activeHourEnd?: number;
}
