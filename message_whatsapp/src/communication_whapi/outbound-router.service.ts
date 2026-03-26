import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { CommunicationWhapiService } from './communication_whapi.service';
import { CommunicationMetaService } from './communication_meta.service';
import { CommunicationMessengerService } from './communication_messenger.service';
import { CommunicationInstagramService } from './communication_instagram.service';
import { CommunicationTelegramService } from './communication_telegram.service';
import { ChannelService } from 'src/channel/channel.service';
import { OutboundSendResponse } from './dto/outbound-send-response.dto';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class OutboundRouterService {
  constructor(
    private readonly whapiService: CommunicationWhapiService,
    private readonly metaService: CommunicationMetaService,
    private readonly messengerService: CommunicationMessengerService,
    private readonly instagramService: CommunicationInstagramService,
    private readonly telegramService: CommunicationTelegramService,
    private readonly channelService: ChannelService,
    private readonly logger: AppLogger,
  ) {}

  async sendTextMessage(data: {
    text: string;
    to: string;
    channelId: string;
    /** Provider message ID du message à citer (reply feature) */
    quotedProviderMessageId?: string;
  }): Promise<OutboundSendResponse> {
    const channel = await this.channelService.findOne(data.channelId);
    if (!channel) {
      throw new NotFoundException(`Channel ${data.channelId} introuvable`);
    }

    const provider = channel.provider ?? 'whapi';

    const BLOCKED_META_STATUSES = ['DISABLED', 'BANNED'];
    if (channel.meta_account_status && BLOCKED_META_STATUSES.includes(channel.meta_account_status)) {
      this.logger.error(
        `OUTBOUND_BLOCKED channel=${data.channelId} meta_account_status=${channel.meta_account_status}`,
        OutboundRouterService.name,
      );
      throw new HttpException(
        `Canal ${data.channelId} désactivé (statut Meta: ${channel.meta_account_status}) — envoi bloqué`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (provider === 'meta') {
      if (!channel.external_id) {
        throw new NotFoundException(
          `Channel ${data.channelId} missing external_id (phone_number_id) for Meta`,
        );
      }

      this.logger.log(
        `OUTBOUND_ROUTE provider=meta channel=${data.channelId} phone_number_id=${channel.external_id}`,
        OutboundRouterService.name,
      );

      const result = await this.metaService.sendTextMessage({
        text: data.text,
        to: data.to,
        phoneNumberId: channel.external_id,
        accessToken: channel.token,
        quotedMessageId: data.quotedProviderMessageId,
      });

      return {
        providerMessageId: result.providerMessageId,
        provider: 'meta',
      };
    }

    if (provider === 'messenger') {
      if (!channel.external_id) {
        throw new NotFoundException(
          `Channel ${data.channelId} missing external_id (page_id) for Messenger`,
        );
      }

      this.logger.log(
        `OUTBOUND_ROUTE provider=messenger channel=${data.channelId} page_id=${channel.external_id}`,
        OutboundRouterService.name,
      );

      const recipientPsid = data.to.includes('@')
        ? data.to.split('@')[0]
        : data.to;

      const result = await this.messengerService.sendTextMessage({
        text: data.text,
        recipientPsid,
        pageId: channel.external_id,
        accessToken: channel.token,
        quotedMessageId: data.quotedProviderMessageId,
      });

      return {
        providerMessageId: result.providerMessageId,
        provider: 'messenger',
      };
    }

    if (provider === 'instagram') {
      if (!channel.external_id) {
        throw new NotFoundException(
          `Channel ${data.channelId} missing external_id (ig_account_id) for Instagram`,
        );
      }

      this.logger.log(
        `OUTBOUND_ROUTE provider=instagram channel=${data.channelId}`,
        OutboundRouterService.name,
      );

      const recipientIgsid = data.to.includes('@')
        ? data.to.split('@')[0]
        : data.to;

      const result = await this.instagramService.sendTextMessage({
        text: data.text,
        recipientIgsid,
        accessToken: channel.token,
        quotedMessageId: data.quotedProviderMessageId,
      });

      return {
        providerMessageId: result.providerMessageId,
        provider: 'instagram',
      };
    }

    if (provider === 'telegram') {
      this.logger.log(
        `OUTBOUND_ROUTE provider=telegram channel=${data.channelId}`,
        OutboundRouterService.name,
      );

      const result = await this.telegramService.sendTextMessage({
        text: data.text,
        chatId: data.to,
        botToken: channel.token,
        quotedMessageId: data.quotedProviderMessageId,
      });

      return {
        providerMessageId: result.providerMessageId,
        provider: 'telegram',
      };
    }

    // Default: Whapi
    this.logger.log(
      `OUTBOUND_ROUTE provider=whapi channel=${data.channelId}`,
      OutboundRouterService.name,
    );

    const result = await this.whapiService.sendToWhapiChannel({
      text: data.text,
      to: data.to,
      channelId: data.channelId,
      quotedId: data.quotedProviderMessageId,
    });

    return {
      providerMessageId: result.message.id,
      provider: 'whapi',
    };
  }

  async sendMediaMessage(data: {
    to: string;
    channelId: string;
    mediaBuffer: Buffer;
    mimeType: string;
    fileName: string;
    mediaType: 'image' | 'video' | 'audio' | 'document';
    caption?: string;
  }): Promise<OutboundSendResponse> {

    
    const channel = await this.channelService.findOne(data.channelId);
    if (!channel) {
      throw new NotFoundException(`Channel ${data.channelId} introuvable`);
    }



    const provider = channel.provider ?? 'whapi';

    const BLOCKED_META_STATUSES = ['DISABLED', 'BANNED'];
    if (channel.meta_account_status && BLOCKED_META_STATUSES.includes(channel.meta_account_status)) {
      this.logger.error(
        `OUTBOUND_MEDIA_BLOCKED channel=${data.channelId} meta_account_status=${channel.meta_account_status}`,
        OutboundRouterService.name,
      );
      throw new HttpException(
        `Canal ${data.channelId} désactivé (statut Meta: ${channel.meta_account_status}) — envoi bloqué`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (provider === 'meta') {
      if (!channel.external_id) {
        throw new NotFoundException(
          `Channel ${data.channelId} missing external_id (phone_number_id) for Meta`,
        );
      }

      this.logger.log(
        `OUTBOUND_MEDIA_ROUTE provider=meta channel=${data.channelId} type=${data.mediaType}`,
        OutboundRouterService.name,
      );

      const result = await this.metaService.sendMediaMessage({
        to: data.to,
        phoneNumberId: channel.external_id,
        accessToken: channel.token,
        mediaBuffer: data.mediaBuffer,
        mimeType: data.mimeType,
        fileName: data.fileName,
        mediaType: data.mediaType,
        caption: data.caption,
      });

      return {
        providerMessageId: result.providerMessageId,
        provider: 'meta',
        providerMediaId: result.providerMediaId,
        mediaUrl: null,
      };
    }

    if (provider === 'messenger') {
      if (!channel.external_id) {
        throw new NotFoundException(
          `Channel ${data.channelId} missing external_id (page_id) for Messenger`,
        );
      }

      this.logger.log(
        `OUTBOUND_MEDIA_ROUTE provider=messenger channel=${data.channelId} type=${data.mediaType}`,
        OutboundRouterService.name,
      );

      const recipientPsid = data.to.includes('@')
        ? data.to.split('@')[0]
        : data.to;

      const result = await this.messengerService.sendMediaMessage({
        recipientPsid,
        pageId: channel.external_id,
        accessToken: channel.token,
        mediaBuffer: data.mediaBuffer,
        mimeType: data.mimeType,
        fileName: data.fileName,
        mediaType: data.mediaType,
      });

      return {
        providerMessageId: result.providerMessageId,
        provider: 'messenger',
        providerMediaId: result.attachmentId,
        mediaUrl: null,
      };
    }

    if (provider === 'instagram') {
      if (!channel.external_id) {
        throw new NotFoundException(
          `Channel ${data.channelId} missing external_id (ig_account_id) for Instagram`,
        );
      }

      this.logger.log(
        `OUTBOUND_MEDIA_ROUTE provider=instagram channel=${data.channelId} type=${data.mediaType}`,
        OutboundRouterService.name,
      );

      const recipientIgsid = data.to.includes('@')
        ? data.to.split('@')[0]
        : data.to;

      const result = await this.instagramService.sendMediaMessage({
        recipientIgsid,
        accessToken: channel.token,
        mediaBuffer: data.mediaBuffer,
        mimeType: data.mimeType,
        fileName: data.fileName,
        mediaType: data.mediaType,
        caption: data.caption,
      });

      return {
        providerMessageId: result.providerMessageId,
        provider: 'instagram',
        providerMediaId: result.attachmentId,
        mediaUrl: null,
      };
    }

    if (provider === 'telegram') {
      this.logger.log(
        `OUTBOUND_MEDIA_ROUTE provider=telegram channel=${data.channelId} type=${data.mediaType}`,
        OutboundRouterService.name,
      );

      // Telegram accepte 'image'|'video'|'audio'|'document' — mapper 'voice' si nécessaire
      const tgMediaType =
        data.mediaType === 'audio' ? 'audio' : data.mediaType;

      const result = await this.telegramService.sendMediaMessage({
        chatId: data.to,
        botToken: channel.token,
        mediaBuffer: data.mediaBuffer,
        mimeType: data.mimeType,
        fileName: data.fileName,
        mediaType: tgMediaType as 'image' | 'video' | 'audio' | 'voice' | 'document',
        caption: data.caption,
        quotedMessageId: undefined,
      });

      return {
        providerMessageId: result.providerMessageId,
        provider: 'telegram',
        mediaUrl: null,
      };
    }

    // Default: Whapi
    this.logger.log(
      `OUTBOUND_MEDIA_ROUTE provider=whapi channel=${data.channelId} type=${data.mediaType}`,
      OutboundRouterService.name,
    );

    const mediaBase64 = data.mediaBuffer.toString('base64');
    const result = await this.whapiService.sendMediaToWhapiChannel({
      to: data.to,
      channelId: data.channelId,
      mediaBase64,
      mimeType: data.mimeType,
      mediaType: data.mediaType,
      caption: data.caption,
      fileName: data.fileName,
    });

    const messageId = result.message.id;

    // Le send response Whapi ne contient pas le lien CDN.
    // On le récupère via GET /messages/{id} (requiert Auto-Download activé dans le dashboard).
    const mediaInfo = await this.whapiService.getMessageMediaLink(
      messageId,
      data.channelId,
    );

    this.logger.log(
      `OUTBOUND_MEDIA_WHAPI_LINK messageId=${messageId} link=${mediaInfo.link ?? 'null'} mediaId=${mediaInfo.mediaId ?? 'null'}`,
      OutboundRouterService.name,
    );

    return {
      providerMessageId: messageId,
      provider: 'whapi',
      providerMediaId: mediaInfo.mediaId ?? null,
      mediaUrl: mediaInfo.link ?? null,
    };
  }
}
