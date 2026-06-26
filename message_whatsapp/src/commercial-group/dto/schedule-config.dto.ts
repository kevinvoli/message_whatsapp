import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ScheduleConfigDto {
  @IsInt()
  @Min(1)
  @Max(14)
  workDaysCount: number;

  @IsDateString()
  firstWorkDay: string;
}

export class GenerateScheduleDto {
  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  months?: number;
}
