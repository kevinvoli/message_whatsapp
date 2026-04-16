import { BadRequestException, Injectable } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import * as FormData from 'form-data';
import { spawn } from 'child_process';
import { AppLogger } from 'src/logging/app-logger.service';
import {
  WhapiFailureKind,
  WhapiOutboundError,
} from './errors/whapi-outbound.error';

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
    /** Meta wamid du message à citer (champ `context.message_id` dans l'API Meta) */
    quotedMessageId?: string;
  }): Promise<{ providerMessageId: string }> {
    const to = this.validateRecipient(data.to);
    const body = this.validateBody(data.text);
    const url = `https://graph.facebook.com/${this.META_API_VERSION}/${data.phoneNumberId}/messages`;

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      try {
        const payload: Record<string, any> = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body },
        };
        if (data.quotedMessageId) {
          payload.context = { message_id: data.quotedMessageId };
        }
        const response = await axios.post(
          url,
          payload,
          {
            headers: {
              Authorization: `Bearer ${data.accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        );

        const messageId = response.data?.messages?.[0]?.id;
        if (!messageId) {
          throw new WhapiOutboundError(
            'Meta response missing message id',
            'permanent',
          );
        }

        return { providerMessageId: messageId };
      } catch (error) {
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
  }): Promise<{ providerMessageId: string; providerMediaId: string }> {
    const to = this.validateRecipient(data.to);
    let mediaBuffer = data.mediaBuffer;
    let mimeType = data.mimeType;
    let fileName = data.fileName;

    const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
    if (data.mediaType === 'audio' && normalizedMime === 'audio/webm') {
      try {
        mediaBuffer = await this.transcodeWebmToOgg(mediaBuffer);
        mimeType = 'audio/ogg';
        fileName = fileName.replace(/\.[^.]+$/, '') + '.ogg';
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : 'unknown_transcode_error';
        throw new WhapiOutboundError(
          `Meta audio transcode failed: ${reason}`,
          'permanent',
          415,
        );
      }
    }

    this.validateMetaMimeType(mimeType, data.mediaType);

    // Step 1: Upload media to Meta
    const uploadUrl = `https://graph.facebook.com/${this.META_API_VERSION}/${data.phoneNumberId}/media`;
    const form = new FormData();
    form.append('file', mediaBuffer, {
      filename: fileName,
      contentType: mimeType,
    });
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);

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
        throw new WhapiOutboundError(
          'Meta media upload: missing media id',
          'permanent',
        );
      }
      this.logger.log(
        `Meta media uploaded: media_id=${mediaId}`,
        CommunicationMetaService.name,
      );
    } catch (error) {
      if (error instanceof WhapiOutboundError) throw error;
      const axiosError = error as AxiosError;
      const uploadStatus = axiosError.response?.status;
      const uploadData = axiosError.response?.data as
        | { error?: { message?: string; code?: number; fbtrace_id?: string } }
        | undefined;
      const uploadMessage =
        uploadData?.error?.message ?? axiosError.message ?? 'unknown_error';
      const uploadCode = uploadData?.error?.code;
      const uploadTrace = uploadData?.error?.fbtrace_id;
      this.logger.error(
        `Meta media upload failed (phone_number_id=${data.phoneNumberId}, mime_type=${mimeType}, status=${uploadStatus ?? 'unknown'}, code=${uploadCode ?? 'unknown'}, trace=${uploadTrace ?? 'unknown'}, message=${uploadMessage})`,
        axiosError.stack,
        CommunicationMetaService.name,
      );
      throw new WhapiOutboundError(
        `Meta media upload failed: ${uploadMessage}`,
        'permanent',
        uploadStatus,
      );
    }

    // Step 2: Send message with media
    const sendUrl = `https://graph.facebook.com/${this.META_API_VERSION}/${data.phoneNumberId}/messages`;
    const mediaPayload: Record<string, any> = { id: mediaId };
    // Caption supportée uniquement pour image, video et document (pas audio)
    if (data.caption && data.mediaType !== 'audio') {
      mediaPayload.caption = data.caption;
    }
    // filename obligatoire pour document (Meta exige ce champ)
    if (data.mediaType === 'document' && data.fileName) {
      mediaPayload.filename = data.fileName;
    }

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
          throw new WhapiOutboundError(
            'Meta response missing message id',
            'permanent',
          );
        }
        return { providerMessageId: messageId, providerMediaId: mediaId };
      } catch (error) {
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
            `Meta media send transient error, retrying (${attempt + 1}/${this.maxRetries + 1}) status=${statusCode ?? 'unknown'}`,
            CommunicationMetaService.name,
          );
          await this.delay(delayMs);
          attempt += 1;
          continue;
        }

        this.logger.error(
        `Meta media send failed (phone_number_id=${data.phoneNumberId}, media_id=${mediaId}, mime_type=${mimeType}, media_type=${data.mediaType}, kind=${kind}, status=${statusCode ?? 'unknown'}, code=${metaCode ?? 'unknown'}, subcode=${metaSubcode ?? 'unknown'}, trace=${metaTraceId ?? 'unknown'}, message=${metaMessage})`,
        axiosError.stack,
        CommunicationMetaService.name,
      );
        throw new WhapiOutboundError(
          `Meta media send failed: ${metaMessage}`,
          kind,
          statusCode,
        );
      }
    }

    throw new WhapiOutboundError('Meta media send failed', 'transient');
  }

  async getMediaUrl(
    mediaId: string,
    accessToken: string,
    phoneNumberId?: string,
  ): Promise<string | null> {
    try {
      const query = phoneNumberId
        ? `?phone_number_id=${encodeURIComponent(phoneNumberId)}`
        : '';
      const url = `https://graph.facebook.com/${this.META_API_VERSION}/${mediaId}${query}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response.data?.url ?? null;
    } catch (error) {
      const axiosError = error as AxiosError;
      const statusCode = axiosError.response?.status;
      const data = axiosError.response?.data as
        | { error?: { message?: string; code?: number } }
        | undefined;
      const reason =
        data?.error?.message ?? axiosError.message ?? 'unknown_error';
      this.logger.warn(
        `Failed to get Meta media URL for mediaId=${mediaId} status=${statusCode ?? 'unknown'} reason=${reason}`,
        CommunicationMetaService.name,
      );
      return null;
    }
  }

  async downloadMedia(
    mediaId: string,
    accessToken: string,
    phoneNumberId?: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
      // Step 1: Get the temporary download URL
      const mediaUrl = await this.getMediaUrl(
        mediaId,
        accessToken,
        phoneNumberId,
      );
      if (!mediaUrl) return null;

      // Step 2: Download the actual file
      return await this.downloadMediaByUrl(mediaUrl, accessToken);
    } catch (error) {
      this.logger.warn(
        `Failed to download Meta media for mediaId=${mediaId}`,
        CommunicationMetaService.name,
      );
      return null;
    }
  }

  async downloadMediaByUrl(
    mediaUrl: string,
    accessToken: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
      const response = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'arraybuffer',
      });

      const buffer = Buffer.from(response.data);
      const mimeType =
        response.headers['content-type'] ?? 'application/octet-stream';
      return { buffer, mimeType };
    } catch (error) {
      const axiosError = error as AxiosError;
      const statusCode = axiosError.response?.status;
      this.logger.warn(
        `Failed to download Meta media from url status=${statusCode ?? 'unknown'}`,
        CommunicationMetaService.name,
      );
      return null;
    }
  }

  /**
   * Formats MIME supportés par l'API WhatsApp Cloud Meta.
   * Ref : https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
   */
  private static readonly META_SUPPORTED_MIMES: Record<string, string[]> = {
    image: ['image/jpeg', 'image/png', 'image/webp'],
    video: ['video/mp4', 'video/3gpp'],
    audio: [
      'audio/aac',
      'audio/mp4',
      'audio/mpeg',
      'audio/amr',
      'audio/ogg',
      'audio/opus',
    ],
    document: [
      'text/plain',
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  };

  private validateMetaMimeType(
    mimeType: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
  ): void {
    const allowed = CommunicationMetaService.META_SUPPORTED_MIMES[mediaType];
    if (!allowed) return;
    // Normaliser : "audio/ogg; codecs=opus" → "audio/ogg"
    const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
    if (!allowed.includes(normalizedMime)) {
      throw new WhapiOutboundError(
        `Format non supporté par Meta pour le type "${mediaType}": ${mimeType}. Formats acceptés: ${allowed.join(', ')}`,
        'permanent',
        415,
      );
    }
  }

  private async transcodeWebmToOgg(input: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i',
        'pipe:0',
        '-f',
        'ogg',
        '-acodec',
        'libopus',
        '-vn',
        'pipe:1',
      ]);

      const chunks: Buffer[] = [];
      let stderr = '';

      ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      ffmpeg.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      ffmpeg.on('error', (err) => {
        reject(err);
      });

      ffmpeg.on('close', (code) => {
        if (code === 0 && chunks.length > 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(
            new Error(
              stderr || `ffmpeg exited with code ${code ?? 'unknown'}`,
            ),
          );
        }
      });

      ffmpeg.stdin.end(input);
    });
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

  /**
   * P4.2/P4.3 — Envoi d'un template HSM via l'API Meta.
   * Utilisé pour les broadcasts et les réponses hors-fenêtre.
   */
  async sendTemplateMessage(data: {
    to: string;
    phoneNumberId: string;
    accessToken: string;
    templateName: string;
    language: string;
    variables?: Record<string, string>;
  }): Promise<{ providerMessageId: string }> {
    const to = this.validateRecipient(data.to);
    const url = `https://graph.facebook.com/${this.META_API_VERSION}/${data.phoneNumberId}/messages`;

    // Construire les composants body (paramètres positionnels)
    const bodyParams = Object.values(data.variables ?? {}).map((value) => ({
      type: 'text',
      text: String(value),
    }));

    const payload: Record<string, any> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: data.templateName,
        language: { code: data.language },
        components: bodyParams.length > 0
          ? [{ type: 'body', parameters: bodyParams }]
          : [],
      },
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${data.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const messageId = response.data?.messages?.[0]?.id;
    if (!messageId) {
      throw new WhapiOutboundError('Meta template response missing message id', 'permanent');
    }
    return { providerMessageId: messageId };
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
