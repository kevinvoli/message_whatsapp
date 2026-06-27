import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCommercialGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;
}

export class UpdateCommercialGroupDto {
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

export class AddMemberDto {
  @IsUUID()
  commercialId: string;
}

export class PatchDisconnectReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  reason: string;
}
