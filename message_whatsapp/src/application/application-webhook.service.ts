import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosError } from 'axios';
import { AppLogger } from 'src/logging/app-logger.service';
import { MessagingApplication } from './entities/messaging-application.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';

@Injectable()
export class ApplicationWebhookService {
  private readonly META_API_VERSION = process.env.META_API_VERSION ?? 'v22.0';

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Re-souscrit les webhooks Meta pour tous les canaux liés à l'application,
   * appelé quand appSecret ou systemToken change.
   */
  async resubscribeForApplication(
    app: MessagingApplication,
    changed: { appSecret: boolean; systemToken: boolean },
  ): Promise<void> {
    if (!changed.appSecret && !changed.systemToken) return;

    const channels = await this.channelRepo.find({
      where: { application_id: app.id },
      select: ['id', 'provider', 'channel_id', 'external_id', 'page_id', 'token', 'verify_token'],
    });

    if (channels.length === 0) return;

    this.logger.log(
      `Re-souscription webhooks pour application ${app.id} (${channels.length} canal(aux))`,
      ApplicationWebhookService.name,
    );

    // WhatsApp Meta : re-souscription au niveau de l'app (un seul appel couvre tous les canaux)
    const metaChannel = channels.find((c) => c.provider === 'meta');
    if (metaChannel && changed.appSecret) {
      await this.resubscribeWhatsappWebhook(
        app.appId,
        app.appSecret,
        metaChannel.verify_token ?? undefined,
      );
    }

    // Messenger / Instagram : re-souscription par page
    for (const channel of channels) {
      if (
        (channel.provider === 'messenger' || channel.provider === 'instagram') &&
        channel.page_id
      ) {
        const accessToken = app.systemToken?.trim() || channel.token;
        await this.resubscribePageWebhook(channel.page_id, accessToken, channel.provider);
      }
    }
  }

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
      const callbackUrl = host ? `${host}${port}/api/webhook/whatsapp` : null;
      if (callbackUrl) params['callback_url'] = callbackUrl;

      const resolvedVerifyToken = verifyToken ?? process.env.WHATSAPP_VERIFY_TOKEN;
      if (resolvedVerifyToken) params['verify_token'] = resolvedVerifyToken;

      await axios.post(
        `https://graph.facebook.com/${this.META_API_VERSION}/${appId}/subscriptions`,
        null,
        { params },
      );

      this.logger.log(
        `Webhook WhatsApp re-souscrit pour app ${appId}`,
        ApplicationWebhookService.name,
      );
    } catch (err: unknown) {
      const msg =
        err instanceof AxiosError
          ? ((err.response?.data as { error?: { message?: string } })?.error?.message ?? err.message)
          : err instanceof Error
            ? err.message
            : String(err);
      this.logger.error(
        `Échec re-souscription webhook WhatsApp app ${appId}: ${msg}`,
        ApplicationWebhookService.name,
      );
    }
  }

  private async resubscribePageWebhook(
    pageId: string,
    accessToken: string,
    provider: string,
  ): Promise<void> {
    try {
      await axios.post(
        `https://graph.facebook.com/${this.META_API_VERSION}/${pageId}/subscribed_apps`,
        null,
        {
          params: {
            subscribed_fields:
              'messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads',
            access_token: accessToken,
          },
        },
      );
      this.logger.log(
        `Webhook ${provider} re-souscrit pour page ${pageId}`,
        ApplicationWebhookService.name,
      );
    } catch (err: unknown) {
      const msg =
        err instanceof AxiosError
          ? ((err.response?.data as { error?: { message?: string } })?.error?.message ?? err.message)
          : err instanceof Error
            ? err.message
            : String(err);
      this.logger.error(
        `Échec re-souscription webhook ${provider} page ${pageId}: ${msg}`,
        ApplicationWebhookService.name,
      );
    }
  }
}
