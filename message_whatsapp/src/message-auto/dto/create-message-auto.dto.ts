import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AutoMessageChannel } from '../entities/message-auto.entity';

export class MessageAutoConditionsDto {
  /** Restreindre ce message à un poste spécifique */
  @IsOptional()
  @IsUUID()
  poste_id?: string;

  /** Restreindre ce message à un canal spécifique (channel_id) */
  @IsOptional()
  @IsString()
  channel_id?: string;

  /** Restreindre ce message à un type de client ('nouveau', 'existant', etc.) */
  @IsOptional()
  @IsString()
  client_type?: string;
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

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MessageAutoConditionsDto)
  conditions?: MessageAutoConditionsDto;
}
