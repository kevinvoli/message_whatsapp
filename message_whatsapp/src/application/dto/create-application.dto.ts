import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @IsOptional()
  @IsString()
  @IsIn(['meta', 'messenger', 'instagram', 'telegram', 'whapi'])
  provider?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  appId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  appSecret: string;

  /** Token System User Meta (permanent). Laisser vide pour utiliser le token par canal. */
  @IsOptional()
  @IsString()
  systemToken?: string;
}
