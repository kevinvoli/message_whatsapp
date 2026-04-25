import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpsertDossierDto {
  @IsOptional()
  @IsString()
  fullName?: string | null;

  @IsOptional()
  @IsString()
  ville?: string | null;

  @IsOptional()
  @IsString()
  commune?: string | null;

  @IsOptional()
  @IsString()
  quartier?: string | null;

  @IsOptional()
  @IsString()
  otherPhones?: string | null;

  @IsOptional()
  @IsString()
  productCategory?: string | null;

  @IsOptional()
  @IsString()
  clientNeed?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  interestScore?: number | null;

  @IsOptional()
  @IsBoolean()
  isMaleNotInterested?: boolean;

  @IsOptional()
  @IsDateString()
  followUpAt?: string | Date | null;

  @IsOptional()
  @IsString()
  nextAction?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
