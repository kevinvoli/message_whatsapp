import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { CreateChannelDto } from 'src/channel/dto/create-channel.dto';
import { ChanneDatalDto } from 'src/channel/dto/channel-data.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhapiSendMessageResponse } from './dto/whapi-send-message-response.dto';
import { WhapiMediaBase } from 'src/whapi/interface/whapi-webhook.interface';
import { AppLogger } from 'src/logging/app-logger.service';
import {
  WhapiFailureKind,
  WhapiOutboundError,
} from './errors/whapi-outbound.error';

@Injectable()
export class CommunicationWhapiService {
  private readonly WHAPI_URL = 'https://gate.whapi.cloud/messages/text';
  private readonly WHAPI_TOKEN = process.env.WHAPI_TOKEN;
  private readonly maxRetries = Number(
    process.env.WHAPI_OUTBOUND_MAX_RETRIES ?? 2,
  );

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    private readonly logger: AppLogger,
  ) {}

  // async sendToWhapi(
  //   to: string,
  //   text: string,
  // ): Promise<{
  //   id: string;
  //   status: number;
  //   statusText: string;
  // }> {
  //   const response = await axios.post(
  //     this.WHAPI_URL,
  //     {
  //       to, // ex: "2250700000000"
  //       body: text,
  //     },
  //     {
  //       headers: {
  //         Authorization: `Bearer ${this.WHAPI_TOKEN}`,
  //         'Content-Type': 'application/json',
  //       },
  //     },
  //   );

  //   return response.data as {
  //     id: string;
  //     status: number;
  //     statusText: string;
  //   };
  // }

  async sendTyping(chat_id: string, typing: boolean) {
    try {
      const chat = await this.chatRepository.findOne({
        where: { chat_id },
        relations: { poste: true },
      });
      if (!chat) return;

      const channel = await this.channelRepository.findOne({
        where: { channel_id: chat.last_msg_client_channel_id },
      });
      if (!channel) return;

      const token = channel.token;

      // PAS de messageId ici !
      await axios.post(
        `https://gate.whapi.cloud/messages/presence`,
        // `${this.WHAPI_URL}`,
        {
          messaging_product: 'whatsapp',
          to: chat.contact_client,
          type: 'typing',
          typing: typing ? 'on' : 'off',
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(
        `Typing sent to Whapi for ${chat.contact_client}`,
        CommunicationWhapiService.name,
      );
    } catch (err) {
      this.logger.error(
        'Whapi typing error',
        err instanceof Error ? err.stack : undefined,
        CommunicationWhapiService.name,
      );
    }
  }

  async sendToWhapiChannel(data: {
    text: string;
    to: string;
    channelId: string;
  }): Promise<WhapiSendMessageResponse> {
    const to = this.validateWhapiRecipient(data.to);
    const body = this.validateWhapiBody(data.text);

    const channel = await this.channelRepository.findOne({
      where: { channel_id: data.channelId },
    });
    const token = channel?.token;

    if (!channel) {
      throw new NotFoundException(`Channel ${data.channelId} introuvable`);
    }
    let attempt = 0;
    while (attempt <= this.maxRetries) {
      try {
        const response = await axios.post<WhapiSendMessageResponse>(
          this.WHAPI_URL,
          {
            to,
            body,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        );

        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError;
        const statusCode = axiosError.response?.status;
        const kind = this.classifyFailure(axiosError);
        const lastAttempt = attempt >= this.maxRetries;

        if (kind === 'transient' && !lastAttempt) {
          const delayMs = 250 * Math.pow(2, attempt);
          this.logger.warn(
            `Whapi transient error, retrying (${attempt + 1}/${this.maxRetries + 1}) channel=${data.channelId} status=${statusCode ?? 'unknown'}`,
            CommunicationWhapiService.name,
          );
          await this.delay(delayMs);
          attempt += 1;
          continue;
        }

        this.logger.error(
          `Whapi outbound failed (channel=${data.channelId}, kind=${kind}, status=${statusCode ?? 'unknown'})`,
          axiosError.stack,
          CommunicationWhapiService.name,
        );
        throw new WhapiOutboundError(
          'Whapi outbound delivery failed',
          kind,
          statusCode,
        );
      }
    }

    throw new WhapiOutboundError('Whapi outbound delivery failed', 'transient');
  }

  async sendMediaToWhapiChannel(data: {
    to: string;
    channelId: string;
    mediaBase64: string;
    mimeType: string;
    mediaType: 'image' | 'video' | 'audio' | 'document';
    caption?: string;
    fileName?: string;
  }): Promise<WhapiSendMessageResponse> {
    const to = this.validateWhapiRecipient(data.to);

    const channel = await this.channelRepository.findOne({
      where: { channel_id: data.channelId },
    });
    if (!channel) {
      throw new NotFoundException(`Channel ${data.channelId} introuvable`);
    }
    const token = channel.token;

    const url = `https://gate.whapi.cloud/messages/${data.mediaType}`;
    const payload: Record<string, any> = {
      to,
      media: `data:${data.mimeType};base64,${data.mediaBase64}`,
    };
    if (data.caption) payload.caption = data.caption;
    if (data.fileName) payload.filename = data.fileName;

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      try {
        const response = await axios.post<WhapiSendMessageResponse>(
          url,
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        );
        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError;
        const statusCode = axiosError.response?.status;
        const kind = this.classifyFailure(axiosError);
        const lastAttempt = attempt >= this.maxRetries;

        if (kind === 'transient' && !lastAttempt) {
          const delayMs = 250 * Math.pow(2, attempt);
          this.logger.warn(
            `Whapi media transient error, retrying (${attempt + 1}/${this.maxRetries + 1}) channel=${data.channelId} status=${statusCode ?? 'unknown'}`,
            CommunicationWhapiService.name,
          );
          await this.delay(delayMs);
          attempt += 1;
          continue;
        }

        this.logger.error(
          `Whapi media outbound failed (channel=${data.channelId}, kind=${kind}, status=${statusCode ?? 'unknown'})`,
          axiosError.stack,
          CommunicationWhapiService.name,
        );
        throw new WhapiOutboundError(
          'Whapi media outbound delivery failed',
          kind,
          statusCode,
        );
      }
    }

    throw new WhapiOutboundError(
      'Whapi media outbound delivery failed',
      'transient',
    );
  }

  private validateWhapiRecipient(to: string): string {
    const candidate = typeof to === 'string' ? to.trim() : '';
    if (!candidate) {
      throw new BadRequestException('Recipient is required');
    }

    if (!/^\d{8,20}$/.test(candidate)) {
      throw new BadRequestException(
        'Invalid recipient format: only digits (8-20) are allowed',
      );
    }

    return candidate;
  }

  private validateWhapiBody(text: string): string {
    const body = typeof text === 'string' ? text.trim() : '';
    if (!body) {
      throw new BadRequestException('Message body cannot be empty');
    }

    const utf8Length = Buffer.byteLength(body, 'utf8');
    if (utf8Length > 4096) {
      throw new BadRequestException('Message body is too large');
    }

    return body;
  }

  private classifyFailure(error: AxiosError): WhapiFailureKind {
    const statusCode = error.response?.status;
    if (!statusCode) return 'transient';
    if ([408, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
      return 'transient';
    }
    return 'permanent';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Récupère le lien CDN et l'ID du média d'un message Whapi envoyé.
   * Whapi ne retourne PAS le lien dans le send response.
   * Il faut appeler GET /messages/{id} après l'envoi (nécessite Auto-Download activé
   * dans le dashboard Whapi).
   * Le lien CDN (Wasabi S3) est valide 30 jours et accessible sans authentification.
   */
  async getMessageMediaLink(
    messageId: string,
    channelId: string,
  ): Promise<{ link: string | null; mediaId: string | null }> {
    const channel = await this.channelRepository.findOne({
      where: { channel_id: channelId },
    });
    if (!channel?.token) {
      return { link: null, mediaId: null };
    }

    try {
      const response = await axios.get(
        `https://gate.whapi.cloud/messages/${encodeURIComponent(messageId)}`,
        {
          headers: {
            Authorization: `Bearer ${channel.token}`,
            Accept: 'application/json',
          },
        },
      );

      const msg = response.data as Record<string, any>;
      const mediaTypes = [
        'image', 'video', 'audio', 'voice', 'document', 'gif',
      ] as const;
      for (const type of mediaTypes) {
        const media = msg[type] as (WhapiMediaBase & { id?: string }) | undefined;
        if (media) {
          return {
            link: media.link ?? null,
            mediaId: media.id ?? null,
          };
        }
      }

      this.logger.warn(
        `No media sub-object found in Whapi GET /messages/${messageId}`,
        CommunicationWhapiService.name,
      );
      return { link: null, mediaId: null };
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.warn(
        `Failed to retrieve Whapi media link for messageId=${messageId} status=${axiosError.response?.status ?? 'unknown'}`,
        CommunicationWhapiService.name,
      );
      return { link: null, mediaId: null };
    }
  }

  /**
   * Télécharge le binaire d'un média Whapi à partir de l'ID du message envoyé.
   * Récupère d'abord l'URL CDN via GET /messages/{id}, puis télécharge le contenu.
   */
  async downloadMedia(
    messageId: string,
    channelId: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const { link } = await this.getMessageMediaLink(messageId, channelId);
    if (!link) {
      this.logger.warn(
        `downloadMedia: aucun lien CDN pour messageId=${messageId}`,
        CommunicationWhapiService.name,
      );
      return null;
    }

    try {
      const response = await axios.get<ArrayBuffer>(link, {
        responseType: 'arraybuffer',
      });
      const mimeType =
        (response.headers['content-type'] as string | undefined)?.split(
          ';',
        )[0] ?? 'application/octet-stream';
      return { buffer: Buffer.from(response.data), mimeType };
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.warn(
        `downloadMedia: échec téléchargement CDN messageId=${messageId} status=${axiosError.response?.status ?? 'unknown'}`,
        CommunicationWhapiService.name,
      );
      return null;
    }
  }

  generateWhapiMessageId(): string {
    const part = (len: number) =>
      Math.random()
        .toString(36)
        .substring(2, 2 + len)
        .toUpperCase();
    return `${part(8)}-${part(6)}-${part(4)}`;
  }
  async getChannel(token: CreateChannelDto): Promise<ChanneDatalDto | null> {
    try {
      const response: { data: any } = await axios.get<WhapiSendMessageResponse>(
        'https://gate.whapi.cloud/health?wakeup=true&platform=Chrome%2CWhapi%2C1.6.0&channel_type=web',
        {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token?.token}`,
          },
        },
      );

      if (!response) {
        return null;
      }

      return response.data;
    } catch (error) {
      throw new NotFoundException(new Error(error));
    }
  }
}
