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
 * Priorité : application liée > aucune (canal legacy sans application).
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
    appId: null,
    appSecret: null,
    accessToken: channel.token,
    isSystemToken: false,
  };
}
