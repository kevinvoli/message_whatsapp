import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AutoMessageScopeType } from '../entities/auto-message-scope-config.entity';

export class UpsertAutoMessageScopeDto {
  @IsEnum(AutoMessageScopeType)
  scope_type: AutoMessageScopeType;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  scope_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsBoolean()
  enabled: boolean;
}
