import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Or, Repository } from 'typeorm';
import axios, { AxiosError } from 'axios';
import { WhapiChannel } from './entities/channel.entity';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class MetaTokenService {
  private readonly META_API_VERSION =
    process.env.META_API_VERSION ?? 'v22.0';

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Échange un token (court ou long) contre un nouveau token longue durée Meta (60 jours).
   */
  async exchangeForLongLivedToken(
    shortLivedToken: string,
    channelAppId?: string | null,
    channelAppSecret?: string | null,
  ): Promise<{
    accessToken: string;
    expiresAt: Date;
  }> {
    const appId = channelAppId;
    const appSecret = channelAppSecret;

    if (!appId || !appSecret) {
      throw new BadRequestException(
        "meta_app_id et meta_app_secret sont requis sur le canal pour échanger un token Meta",
      );
    }

    const url = `https://graph.facebook.com/${this.META_API_VERSION}/oauth/access_token`;

    try {
      const response = await axios.get<{
        access_token: string;
        token_type: string;
        expires_in: number;
      }>(url, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortLivedToken,
        },
      });

      const { access_token, expires_in } = response.data;
      // expires_in peut être absent sur certains tokens Meta — fallback 60 jours
      const expiresInMs = expires_in && !isNaN(expires_in)
        ? expires_in * 1000
        : 60 * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + expiresInMs);

      return { accessToken: access_token, expiresAt };
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        if (err.response) {
          const metaError = err.response.data as {
            error?: { message?: string; type?: string; code?: number };
          };
          const msg =
            metaError?.error?.message ??
            `Meta API error ${err.response.status}`;
          this.logger.error(
            `Meta token exchange failed (${err.response.status}): ${msg}`,
            MetaTokenService.name,
          );
          throw new BadRequestException(`Meta: ${msg}`);
        }
        const networkMsg = err.message ?? "Impossible de joindre l'API Meta";
        this.logger.error(
          `Meta token exchange network error: ${networkMsg}`,
          MetaTokenService.name,
        );
        throw new BadRequestException(`Erreur réseau Meta: ${networkMsg}`);
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Meta token exchange unexpected error: ${msg}`,
        MetaTokenService.name,
      );
      throw new BadRequestException(`Erreur lors de l'échange de token: ${msg}`);
    }
  }

  /**
   * Dérive un Page Access Token (PAT) depuis un User Token ou System User Token.
   * Nécessaire quand le token stocké est un User/System User token et non un PAT direct.
   *
   * GET /{page-id}?fields=access_token&access_token={user_token}
   *
   * Retourne null si la page n'est pas accessible avec ce token (pas d'erreur lancée).
   */
  async getPageAccessToken(
    pageId: string,
    userToken: string,
  ): Promise<string | null> {
    try {
      const response = await axios.get<{ access_token?: string }>(
        `https://graph.facebook.com/${this.META_API_VERSION}/${pageId}`,
        { params: { fields: 'access_token', access_token: userToken } },
      );
      return response.data?.access_token ?? null;
    } catch (err: unknown) {
      const msg = err instanceof AxiosError
        ? (err.response?.data as any)?.error?.message ?? err.message
        : err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Impossible de dériver le PAT pour la page ${pageId}: ${msg}`,
        MetaTokenService.name,
      );
      return null;
    }
  }

  /**
   * Rafraîchit le token d'un canal Meta spécifique et met à jour la BDD.
   * Déclenche aussi la re-souscription webhook pour éviter la déconnexion silencieuse.
   */
  async refreshChannelToken(channelId: string): Promise<WhapiChannel> {
    const channel = await this.channelRepo.findOne({ where: { id: channelId } });

    if (!channel) {
      throw new NotFoundException(`Canal ${channelId} introuvable`);
    }

    const PROVIDERS_WITH_LONG_LIVED_TOKEN = ['meta', 'messenger', 'instagram'];
    if (!PROVIDERS_WITH_LONG_LIVED_TOKEN.includes(channel.provider ?? '')) {
      throw new BadRequestException(
        `Le canal ${channelId} (provider: ${channel.provider ?? 'inconnu'}) ne supporte pas le refresh de token`,
      );
    }

    const { accessToken, expiresAt } = await this.exchangeForLongLivedToken(
      channel.token,
      channel.meta_app_id,
      channel.meta_app_secret,
    );

    channel.token = accessToken;
    channel.tokenExpiresAt = expiresAt;
    await this.channelRepo.save(channel);

    this.logger.log(
      `Token Meta refreshé pour canal ${channelId}, expire le ${expiresAt.toISOString()}`,
      MetaTokenService.name,
    );

    // Re-souscription automatique du webhook après refresh
    // Évite que Meta suspende la livraison des webhooks après changement de token
    if (channel.provider === 'meta' && channel.meta_app_id && channel.meta_app_secret) {
      await this.resubscribeWhatsappWebhook(
        channel.meta_app_id,
        channel.meta_app_secret,
        channel.verify_token ?? undefined,
      );
    } else if (['messenger', 'instagram'].includes(channel.provider ?? '') && channel.page_id) {
      await this.resubscribePageWebhook(channel.page_id, accessToken);
    }

    return channel;
  }

  /**
   * Retourne les canaux Meta/Messenger/Instagram dont le token expire dans < thresholdDays jours.
   * Utilisé pour le preview admin.
   */
  async getExpiringChannels(thresholdDays: number = 7): Promise<{
    total: number;
    channels: { id: string; label: string | null; provider: string; tokenExpiresAt: Date | null; daysLeft: number | null }[];
  }> {
    const threshold = new Date(Date.now() + thresholdDays * 24 * 60 * 60 * 1000);
    const PROVIDERS = ['meta', 'messenger', 'instagram'];

    const channels = await this.channelRepo
      .createQueryBuilder('channel')
      .where('channel.provider IN (:...providers)', { providers: PROVIDERS })
      .andWhere(
        '(channel.tokenExpiresAt IS NULL OR channel.tokenExpiresAt < :threshold)',
        { threshold },
      )
      .getMany();

    return {
      total: channels.length,
      channels: channels.map((c) => ({
        id: c.id,
        label: c.label ?? null,
        provider: c.provider ?? '',
        tokenExpiresAt: c.tokenExpiresAt,
        daysLeft: c.tokenExpiresAt
          ? Math.floor((new Date(c.tokenExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
          : null,
      })),
    };
  }

  /**
   * Cron : refresh automatique des canaux Meta/Messenger/Instagram
   * dont le token expire dans < thresholdDays jours OU dont tokenExpiresAt est NULL.
   */
  async refreshExpiringTokens(thresholdDays: number = 7): Promise<void> {
    const threshold = new Date(Date.now() + thresholdDays * 24 * 60 * 60 * 1000);
    const PROVIDERS = ['meta', 'messenger', 'instagram'];

    const channels = await this.channelRepo
      .createQueryBuilder('channel')
      .where('channel.provider IN (:...providers)', { providers: PROVIDERS })
      .andWhere(
        '(channel.tokenExpiresAt IS NULL OR channel.tokenExpiresAt < :threshold)',
        { threshold },
      )
      .getMany();

    if (channels.length === 0) {
      this.logger.log('Aucun token Meta à renouveler', MetaTokenService.name);
      return;
    }

    this.logger.log(
      `${channels.length} token(s) Meta à renouveler (expiration < 7 jours ou non initialisé)`,
      MetaTokenService.name,
    );

    for (const channel of channels) {
      try {
        await this.refreshChannelToken(channel.id);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Échec refresh token canal ${channel.id}: ${message}`,
          MetaTokenService.name,
        );
      }
    }
  }

  /**
   * Re-souscrit le webhook WhatsApp Business au niveau de l'app.
   * Utilise un app access token (APP_ID|APP_SECRET).
   */
  private async resubscribeWhatsappWebhook(
    appId: string,
    appSecret: string,
    verifyToken?: string,
  ): Promise<void> {
    try {
      const appToken = `${appId}|${appSecret}`;
      const params: Record<string, string> = {
        object: 'whatsapp_business_account',
        fields: 'messages,message_template_status_update',
        access_token: appToken,
      };

      const host = process.env.SERVER_PUBLIC_HOST ?? '';
      const port = process.env.SERVER_PORT ? `:${process.env.SERVER_PORT}` : '';
      const callbackUrl = host
        ? `${host}${port}/api/webhook/whatsapp`
        : null;
      if (callbackUrl) params['callback_url'] = callbackUrl;

      // verify_token : priorité au token du canal, sinon fallback env global
      const resolvedVerifyToken = verifyToken ?? process.env.WHATSAPP_VERIFY_TOKEN;
      if (resolvedVerifyToken) params['verify_token'] = resolvedVerifyToken;

      await axios.post(
        `https://graph.facebook.com/${this.META_API_VERSION}/${appId}/subscriptions`,
        null,
        { params },
      );

      this.logger.log(
        `Webhook WhatsApp re-souscrit pour app ${appId}`,
        MetaTokenService.name,
      );
    } catch (err: unknown) {
      const msg = err instanceof AxiosError
        ? (err.response?.data as any)?.error?.message ?? err.message
        : err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Échec re-souscription webhook WhatsApp app ${appId}: ${msg}`,
        MetaTokenService.name,
      );
    }
  }

  /**
   * Re-souscrit le webhook Messenger/Instagram au niveau de la page.
   */
  private async resubscribePageWebhook(
    pageId: string,
    accessToken: string,
  ): Promise<void> {
    try {
      await axios.post(
        `https://graph.facebook.com/${this.META_API_VERSION}/${pageId}/subscribed_apps`,
        null,
        {
          params: {
            subscribed_fields: 'messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads',
            access_token: accessToken,
          },
        },
      );
      this.logger.log(
        `Webhook Messenger/Instagram re-souscrit pour page ${pageId}`,
        MetaTokenService.name,
      );
    } catch (err: unknown) {
      const msg = err instanceof AxiosError
        ? (err.response?.data as any)?.error?.message ?? err.message
        : err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Échec re-souscription webhook page ${pageId}: ${msg}`,
        MetaTokenService.name,
      );
    }
  }
}
