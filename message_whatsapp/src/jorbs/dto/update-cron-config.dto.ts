import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
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
}
