import { MessagingApplication } from 'src/application/entities/messaging-application.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';

export interface ChannelCredentials {
  appId: string | null;
  appSecret: string | null;
  accessToken: string;
  isSystemToken: boolean;
}

type ChannelWithApplication = WhapiChannel & {
  application?: MessagingApplication | null;
};

/**
 * Résout les credentials effectifs d'un canal.
 * Priorité : application liée > champs directs du canal (rétrocompatibilité).
 */
export function resolveChannelCredentials(
  channel: ChannelWithApplication,
): ChannelCredentials {
  const app = channel.application;

  if (app) {
    const systemToken = app.systemToken?.trim() || null;
    return {
      appId: app.appId,
      appSecret: app.appSecret,
      accessToken: systemToken ?? channel.token,
      isSystemToken: !!systemToken,
    };
  }

  return {
    appId: channel.meta_app_id ?? null,
    appSecret: channel.meta_app_secret ?? null,
    accessToken: channel.token,
    isSystemToken: false,
  };
}
