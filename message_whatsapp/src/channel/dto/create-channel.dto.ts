import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  token: string;

  @IsOptional()
  @IsString()
  @IsIn(['whapi', 'meta', 'messenger', 'instagram', 'telegram'])
  provider?: 'whapi' | 'meta' | 'messenger' | 'instagram' | 'telegram';

  @IsOptional()
  @IsString()
  channel_id?: string;

  @IsOptional()
  @IsString()
  external_id?: string;

  @IsOptional()
  @IsBoolean()
  is_business?: boolean;

  @IsOptional()
  @IsString()
  label?: string;

  /** App ID Meta (requis pour meta/messenger/instagram si META_APP_ID non défini dans .env) */
  @IsOptional()
  @IsString()
  meta_app_id?: string;

  /** App Secret Meta (requis pour meta/messenger/instagram si META_APP_SECRET non défini dans .env) */
  @IsOptional()
  @IsString()
  meta_app_secret?: string;

  /** Secret de webhook (Telegram uniquement — généré automatiquement si absent) */
  @IsOptional()
  @IsString()
  webhook_secret?: string;

  /** Token de vérification webhook (meta/messenger/instagram — requis pour le challenge GET Meta) */
  @IsOptional()
  @IsString()
  verify_token?: string;
}
