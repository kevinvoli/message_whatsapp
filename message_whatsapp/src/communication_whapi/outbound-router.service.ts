import { Injectable, NotFoundException } from '@nestjs/common';
import { CommunicationWhapiService } from './communication_whapi.service';
import { CommunicationMetaService } from './communication_meta.service';
import { ChannelService } from 'src/channel/channel.service';
import { OutboundSendResponse } from './dto/outbound-send-response.dto';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class OutboundRouterService {
  constructor(
    private readonly whapiService: CommunicationWhapiService,
    private readonly metaService: CommunicationMetaService,
    private readonly channelService: ChannelService,
    private readonly logger: AppLogger,
  ) {}

  async sendTextMessage(data: {
    text: string;
    to: string;
    channelId: string;
  }): Promise<OutboundSendResponse> {
    const channel = await this.channelService.findOne(data.channelId);
    if (!channel) {
      throw new NotFoundException(`Channel ${data.channelId} introuvable`);
    }

    const provider = channel.provider ?? 'whapi';

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
      });

      return {
        providerMessageId: result.providerMessageId,
        provider: 'meta',
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

    console.log("qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq");

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
