import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { Channel, ChannelProps } from './channel.entity';

export class ChannelMapper {
  static toDomain(orm: WhapiChannel): Channel {
    const props: ChannelProps = {
      id: orm.id,
      channelId: orm.channel_id,
      provider: orm.provider ?? 'whapi',
      label: orm.label,
      tenantId: orm.tenant_id,
      externalId: orm.external_id,
      token: orm.token,
      metaAppId: orm.meta_app_id,
      metaAppSecret: orm.meta_app_secret,
      webhookSecret: orm.webhook_secret,
      verifyToken: orm.verify_token,
      tokenExpiresAt: orm.tokenExpiresAt,
      isBusiness: orm.is_business,
      apiVersion: orm.api_version,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    };
    return Channel.create(props);
  }

  static toOrm(domain: Channel): Partial<WhapiChannel> {
    const props = domain.toProps();
    return {
      id: props.id,
      channel_id: props.channelId,
      provider: props.provider,
      label: props.label ?? undefined,
      tenant_id: props.tenantId ?? undefined,
      external_id: props.externalId ?? undefined,
      token: props.token,
      meta_app_id: props.metaAppId ?? undefined,
      meta_app_secret: props.metaAppSecret ?? undefined,
      webhook_secret: props.webhookSecret ?? undefined,
      verify_token: props.verifyToken ?? undefined,
      tokenExpiresAt: props.tokenExpiresAt,
      is_business: props.isBusiness,
      api_version: props.apiVersion,
    };
  }
}
