import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSubGroupDto {
  @IsUUID()
  parentGroupId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;
}

export class UpdateSubGroupDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpsertBreakScheduleDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  reminderIntervalMinutes?: number;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  popupMessageText?: string;

  @IsUUID()
  @IsOptional()
  popupAudioAssetId?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxDurationMinutes?: number;
}

export class CreateBreakExclusionDto {
  @IsUUID()
  subGroupId: string;

  @IsIn(['poste', 'commercial'])
  scope: 'poste' | 'commercial';

  @IsUUID()
  @IsOptional()
  posteId?: string;

  @IsUUID()
  @IsOptional()
  commercialId?: string;
}

export class TakeBreakDto {
  @IsUUID()
  breakScheduleId: string;
}
