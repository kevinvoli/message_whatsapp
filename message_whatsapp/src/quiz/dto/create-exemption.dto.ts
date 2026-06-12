import { IsEnum, IsUUID, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateExemptionDto {
  @IsEnum(['commercial', 'poste'])
  scope: 'commercial' | 'poste';

  @IsOptional()
  @IsUUID()
  commercialId?: string;

  @IsOptional()
  @IsUUID()
  posteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
