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

  /** App ID Meta (requis pour meta/messenger/instagram — échange token + signature webhooks) */
  @IsOptional()
  @IsString()
  meta_app_id?: string;

  /** App Secret Meta (requis pour meta/messenger/instagram — signature HMAC des webhooks) */
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

  /** Page ID Facebook/Instagram (requis pour re-souscription webhook Messenger/Instagram) */
  @IsOptional()
  @IsString()
  page_id?: string;

  /** Token permanent (System User) — skip l'échange long-lived, jamais expiré */
  @IsOptional()
  @IsBoolean()
  permanent_token?: boolean;

  /** Bloque le passage en lecture seule des conversations de ce channel */
  @IsOptional()
  @IsBoolean()
  no_read_only?: boolean;

  /** Bloque la fermeture automatique ou manuelle des conversations de ce channel */
  @IsOptional()
  @IsBoolean()
  no_close?: boolean;
}
