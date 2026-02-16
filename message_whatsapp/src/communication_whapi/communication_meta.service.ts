import { BadRequestException, Injectable } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import * as FormData from 'form-data';
import { AppLogger } from 'src/logging/app-logger.service';
import { WhapiFailureKind, WhapiOutboundError } from './errors/whapi-outbound.error';

@Injectable()
export class CommunicationMetaService {
  private readonly META_API_VERSION = process.env.META_API_VERSION ?? 'v22.0';
  private readonly maxRetries = Number(
    process.env.META_OUTBOUND_MAX_RETRIES ?? 2,
  );

  constructor(private readonly logger: AppLogger) {}

  async sendTextMessage(data: {
    text: string;
    to: string;
    phoneNumberId: string;
    accessToken: string;
  }): Promise<{ providerMessageId: string }> {
    const to = this.validateRecipient(data.to);
    const body = this.validateBody(data.text);
    const url = `https://graph.facebook.com/${this.META_API_VERSION}/${data.phoneNumberId}/messages`;
console.log("l'url de l'envoie du message :", url);

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      try {
        const response = await axios.post(
          url,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { preview_url: false, body },
          },
          {
            headers: {
              Authorization: `Bearer ${data.accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        );
console.log("l'url de l'envoie du message================== :", response);

        const messageId = response.data?.messages?.[0]?.id;
        if (!messageId) {
          throw new WhapiOutboundError(
            'Meta response missing message id',
            'permanent',
          );
        }

        return { providerMessageId: messageId };
      } catch (error) {
        console.log("erreur axios",error);
        
        if (error instanceof WhapiOutboundError) throw error;

        const axiosError = error as AxiosError;
        const statusCode = axiosError.response?.status;
        const responseData = axiosError.response?.data as
          | {
              error?: {
                message?: string;
                type?: string;
                code?: number;
                error_subcode?: number;
                fbtrace_id?: string;
              };
            }
          | undefined;
        const metaMessage =
          responseData?.error?.message ?? axiosError.message ?? 'unknown_error';
        const metaCode = responseData?.error?.code;
        const metaSubcode = responseData?.error?.error_subcode;
        const metaTraceId = responseData?.error?.fbtrace_id;
        const kind = this.classifyFailure(axiosError);
        const lastAttempt = attempt >= this.maxRetries;

        if (kind === 'transient' && !lastAttempt) {
          const delayMs = 250 * Math.pow(2, attempt);
          this.logger.warn(
            `Meta transient error, retrying (${attempt + 1}/${this.maxRetries + 1}) phone_number_id=${data.phoneNumberId} status=${statusCode ?? 'unknown'}`,
            CommunicationMetaService.name,
          );
          await this.delay(delayMs);
          attempt += 1;
          continue;
        }

        this.logger.error(
          `Meta outbound failed (phone_number_id=${data.phoneNumberId}, kind=${kind}, status=${statusCode ?? 'unknown'}, code=${metaCode ?? 'unknown'}, subcode=${metaSubcode ?? 'unknown'}, trace=${metaTraceId ?? 'unknown'}, message=${metaMessage})`,
          axiosError.stack,
          CommunicationMetaService.name,
        );
        throw new WhapiOutboundError(
          `Meta outbound delivery failed: ${metaMessage}`,
          kind,
          statusCode,
        );
      }
    }

    throw new WhapiOutboundError('Meta outbound delivery failed', 'transient');
  }

  async sendMediaMessage(data: {
    to: string;
    phoneNumberId: string;
    accessToken: string;
    mediaBuffer: Buffer;
    mimeType: string;
    fileName: string;
    mediaType: 'image' | 'video' | 'audio' | 'document';
    caption?: string;
  }): Promise<{ providerMessageId: string }> {
    const to = this.validateRecipient(data.to);

    // Step 1: Upload media to Meta
    const uploadUrl = `https://graph.facebook.com/${this.META_API_VERSION}/${data.phoneNumberId}/media`;
    const form = new FormData();
    form.append('file', data.mediaBuffer, {
      filename: data.fileName,
      contentType: data.mimeType,
    });
    form.append('messaging_product', 'whatsapp');
    form.append('type', data.mimeType);

    let mediaId: string;
    try {
      const uploadResponse = await axios.post(uploadUrl, form, {
        headers: {
          Authorization: `Bearer ${data.accessToken}`,
          ...form.getHeaders(),
        },
      });
      mediaId = uploadResponse.data?.id;
      if (!mediaId) {
        throw new WhapiOutboundError('Meta media upload: missing media id', 'permanent');
      }
      this.logger.log(
        `Meta media uploaded: media_id=${mediaId}`,
        CommunicationMetaService.name,
      );
    } catch (error) {
      if (error instanceof WhapiOutboundError) throw error;
      const axiosError = error as AxiosError;
      this.logger.error(
        `Meta media upload failed (status=${axiosError.response?.status ?? 'unknown'})`,
        axiosError.stack,
        CommunicationMetaService.name,
      );
      throw new WhapiOutboundError('Meta media upload failed', 'permanent', axiosError.response?.status);
    }

    // Step 2: Send message with media
    const sendUrl = `https://graph.facebook.com/${this.META_API_VERSION}/${data.phoneNumberId}/messages`;
    const mediaPayload: Record<string, any> = { id: mediaId };
    if (data.caption) mediaPayload.caption = data.caption;

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      try {
        const response = await axios.post(
          sendUrl,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: data.mediaType,
            [data.mediaType]: mediaPayload,
          },
          {
            headers: {
              Authorization: `Bearer ${data.accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        );

        const messageId = response.data?.messages?.[0]?.id;
        if (!messageId) {
          throw new WhapiOutboundError('Meta response missing message id', 'permanent');
        }
        return { providerMessageId: messageId };
      } catch (error) {
        if (error instanceof WhapiOutboundError) throw error;
        const axiosError = error as AxiosError;
        const statusCode = axiosError.response?.status;
        const kind = this.classifyFailure(axiosError);
        const lastAttempt = attempt >= this.maxRetries;

        if (kind === 'transient' && !lastAttempt) {
          const delayMs = 250 * Math.pow(2, attempt);
          this.logger.warn(
            `Meta media send transient error, retrying (${attempt + 1}/${this.maxRetries + 1})`,
            CommunicationMetaService.name,
          );
          await this.delay(delayMs);
          attempt += 1;
          continue;
        }

        this.logger.error(
          `Meta media send failed (kind=${kind}, status=${statusCode ?? 'unknown'})`,
          axiosError.stack,
          CommunicationMetaService.name,
        );
        throw new WhapiOutboundError('Meta media send failed', kind, statusCode);
      }
    }

    throw new WhapiOutboundError('Meta media send failed', 'transient');
  }

  async getMediaUrl(mediaId: string, accessToken: string): Promise<string | null> {
    try {
      const url = `https://graph.facebook.com/${this.META_API_VERSION}/${mediaId}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response.data?.url ?? null;
    } catch (error) {
      this.logger.warn(
        `Failed to get Meta media URL for mediaId=${mediaId}`,
        CommunicationMetaService.name,
      );
      return null;
    }
  }

  async downloadMedia(mediaId: string, accessToken: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
      // Step 1: Get the temporary download URL
      const mediaUrl = await this.getMediaUrl(mediaId, accessToken);
      if (!mediaUrl) return null;

      // Step 2: Download the actual file
      const response = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'arraybuffer',
      });

      const buffer = Buffer.from(response.data);
      const mimeType = response.headers['content-type'] ?? 'application/octet-stream';
      return { buffer, mimeType };
    } catch (error) {
      this.logger.warn(
        `Failed to download Meta media for mediaId=${mediaId}`,
        CommunicationMetaService.name,
      );
      return null;
    }
  }

  private validateRecipient(to: string): string {
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

  private validateBody(text: string): string {
    const body = typeof text === 'string' ? text.trim() : '';
    if (!body) {
      throw new BadRequestException('Message body cannot be empty');
    }
    if (Buffer.byteLength(body, 'utf8') > 4096) {
      throw new BadRequestException('Message body is too large');
    }
    return body;
  }

  private classifyFailure(error: AxiosError): WhapiFailureKind {
    const statusCode = error.response?.status;
    if (!statusCode) return 'transient';
    if ([408, 429, 500, 502, 503, 504].includes(statusCode)) {
      return 'transient';
    }
    return 'permanent';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
