import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

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

  @IsOptional()
  @IsBoolean()
  is_queue_enabled?: boolean;

  /** Identifiant numérique sur la plateforme GICOP — nullable */
  @IsOptional()
  @IsInt()
  @Min(1)
  numero_poste?: number | null;
}
