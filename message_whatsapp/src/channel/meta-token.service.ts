import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import axios, { AxiosError } from 'axios';
import { WhapiChannel } from './entities/channel.entity';
import { AppLogger } from 'src/logging/app-logger.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MetaTokenService {
  private readonly META_API_VERSION: string;

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
    private readonly logger: AppLogger,
    private readonly configService: ConfigService,
  ) {
    this.META_API_VERSION = this.configService.get<string>('META_API_VERSION') ?? 'v22.0';
  }

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
      // Pour toute autre erreur inattendue, wrapper en BadRequestException avec message lisible
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Meta token exchange unexpected error: ${msg}`,
        MetaTokenService.name,
      );
      throw new BadRequestException(`Erreur lors de l'échange de token: ${msg}`);
    }
  }

  /**
   * Rafraîchit le token d'un canal Meta spécifique et met à jour la BDD.
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

    return channel;
  }

  /**
   * Cron : refresh automatique des canaux Meta dont le token expire dans < 7 jours.
   */
  async refreshExpiringTokens(): Promise<void> {
    const threshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const channels = await this.channelRepo.find({
      where: {
        provider: 'meta',
        tokenExpiresAt: LessThan(threshold),
      },
    });

    if (channels.length === 0) {
      this.logger.log('Aucun token Meta à renouveler', MetaTokenService.name);
      return;
    }

    this.logger.log(
      `${channels.length} token(s) Meta à renouveler (expiration < 7 jours)`,
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
}
