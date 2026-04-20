import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { TargetMetric, TargetPeriodType } from '../entities/commercial_target.entity';

export class CreateTargetDto {
  @IsNotEmpty()
  @IsString()
  commercial_id: string;

  @IsOptional()
  @IsString()
  commercial_name?: string;

  @IsEnum(TargetPeriodType)
  period_type: TargetPeriodType;

  @IsNotEmpty()
  @IsString()
  period_start: string;

  @IsEnum(TargetMetric)
  metric: TargetMetric;

  @IsInt()
  @Min(1)
  target_value: number;
}
