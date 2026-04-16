import { IsString, IsOptional } from 'class-validator';

export class CreateLabelDto {
  @IsString()
  tenant_id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}
