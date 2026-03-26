import { DomainError } from 'src/domain/shared/domain.error';

export interface ChannelProps {
  id: string;
  channelId: string;
  provider: string;
  label?: string | null;
  tenantId?: string | null;
  externalId?: string | null;
  token: string;
  metaAppId?: string | null;
  metaAppSecret?: string | null;
  webhookSecret?: string | null;
  verifyToken?: string | null;
  tokenExpiresAt?: Date | null;
  isBusiness: boolean;
  apiVersion: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Channel {
  readonly id: string;
  readonly channelId: string;
  readonly provider: string;
  readonly label: string | null;
  readonly tenantId: string | null;
  readonly externalId: string | null;
  readonly token: string;
  readonly metaAppId: string | null;
  readonly metaAppSecret: string | null;
  readonly webhookSecret: string | null;
  readonly verifyToken: string | null;
  readonly tokenExpiresAt: Date | null;
  readonly isBusiness: boolean;
  readonly apiVersion: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: ChannelProps) {
    this.id = props.id;
    this.channelId = props.channelId;
    this.provider = props.provider;
    this.label = props.label ?? null;
    this.tenantId = props.tenantId ?? null;
    this.externalId = props.externalId ?? null;
    this.token = props.token;
    this.metaAppId = props.metaAppId ?? null;
    this.metaAppSecret = props.metaAppSecret ?? null;
    this.webhookSecret = props.webhookSecret ?? null;
    this.verifyToken = props.verifyToken ?? null;
    this.tokenExpiresAt = props.tokenExpiresAt ?? null;
    this.isBusiness = props.isBusiness;
    this.apiVersion = props.apiVersion;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: ChannelProps): Channel {
    if (!props.channelId) throw new DomainError('channelId est requis');
    if (!props.provider) throw new DomainError('provider est requis');
    if (!props.token) throw new DomainError('token est requis');
    return new Channel(props);
  }

  isWhapi(): boolean {
    return this.provider === 'whapi';
  }

  isMeta(): boolean {
    return this.provider === 'meta';
  }

  isTokenExpired(): boolean {
    if (!this.tokenExpiresAt) return false;
    return this.tokenExpiresAt < new Date();
  }

  toProps(): ChannelProps {
    return {
      id: this.id,
      channelId: this.channelId,
      provider: this.provider,
      label: this.label,
      tenantId: this.tenantId,
      externalId: this.externalId,
      token: this.token,
      metaAppId: this.metaAppId,
      metaAppSecret: this.metaAppSecret,
      webhookSecret: this.webhookSecret,
      verifyToken: this.verifyToken,
      tokenExpiresAt: this.tokenExpiresAt,
      isBusiness: this.isBusiness,
      apiVersion: this.apiVersion,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
