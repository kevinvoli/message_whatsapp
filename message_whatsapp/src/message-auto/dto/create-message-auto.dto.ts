import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateMessageAutoDto {
  @IsString()
  contenu: string;

  @IsInt()
  @Min(1)
  position: number;

  @IsOptional()
  @IsBoolean()
  actif?: boolean = true;
}
