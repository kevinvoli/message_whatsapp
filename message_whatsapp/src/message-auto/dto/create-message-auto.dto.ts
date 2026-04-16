import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AutoMessageChannel, AutoMessageTriggerType } from '../entities/message-auto.entity';
import { KeywordMatchType } from '../entities/auto-message-keyword.entity';

export class MessageAutoConditionsDto {
  @IsOptional() @IsString()  poste_id?: string;
  @IsOptional() @IsString()  channel_id?: string;
  @IsOptional() @IsString()  client_type?: string;
  @IsOptional() @IsArray() @IsString({ each: true })  excluded_channel_ids?: string[];
  @IsOptional() @IsArray() @IsString({ each: true })  excluded_poste_ids?: string[];
}

export class CreateAutoMessageKeywordDto {
  @IsString()
  @MaxLength(100)
  keyword: string;

  @IsOptional()
  @IsEnum(KeywordMatchType)
  matchType?: KeywordMatchType;

  @IsOptional()
  @IsBoolean()
  caseSensitive?: boolean;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class CreateMessageAutoDto {
  @IsString()
  body: string;

  /** Délai en secondes avant l'envoi (0 = utiliser la plage globale des settings) */
  @IsOptional()
  @IsInt()
  @Min(0)
  delai?: number;

  @IsOptional()
  @IsEnum(AutoMessageChannel)
  canal?: AutoMessageChannel;

  @IsInt()
  @Min(1)
  position: number;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  /** Critère de déclenchement — défaut : 'sequence' */
  @IsOptional()
  @IsEnum(AutoMessageTriggerType)
  trigger_type?: AutoMessageTriggerType;

  /** Scope de restriction : null = global */
  @IsOptional()
  @IsIn(['poste', 'canal'])
  scope_type?: 'poste' | 'canal';

  /** Obligatoire si scope_type est fourni */
  @ValidateIf((o) => o.scope_type != null)
  @IsString()
  @MaxLength(100)
  scope_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  scope_label?: string;

  /** Pour trigger_type='client_type' */
  @IsOptional()
  @IsIn(['new', 'returning', 'all'])
  client_type_target?: 'new' | 'returning' | 'all';

  /** Mots-clés déclencheurs (pour trigger_type='keyword') */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAutoMessageKeywordDto)
  keywords?: CreateAutoMessageKeywordDto[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MessageAutoConditionsDto)
  conditions?: MessageAutoConditionsDto;
}
