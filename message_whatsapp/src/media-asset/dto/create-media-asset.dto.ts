import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';

export class CreateMediaAssetDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(7)
  colorLabel?: string;
}
