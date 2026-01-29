import { IsBoolean, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateWhatsappPosteDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  name: string; // ex: "Service client"

  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  code: string; // ex: "SUPPORT"

  // @IsString()
  // @IsNotEmpty()
  // @Length(5, 100)
  // @IsOptional()
  // description: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
