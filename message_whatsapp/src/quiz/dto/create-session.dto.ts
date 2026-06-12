import {
  IsString,
  MaxLength,
  IsDateString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
  IsArray,
  IsUUID,
} from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsDateString()
  sessionDate: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  passingScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalTimeMinutes?: number;

  @IsArray()
  @IsUUID(undefined, { each: true })
  questionIds: string[];
}
