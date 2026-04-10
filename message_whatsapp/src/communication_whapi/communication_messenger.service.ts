import { Injectable } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import * as FormData from 'form-data';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class CommunicationMessengerService {
  private readonly META_API_VERSION =
    process.env.META_API_VERSION ?? 'v21.0';

  /** Cache TTL 1h : évite un appel Graph API à chaque message du même utilisateur */
  private readonly nameCache = new Map<string, { name: string; expiresAt: number }>();

  constructor(private readonly logger: AppLogger) {}

  /**
   * Récupère le nom complet d'un utilisateur Messenger via son PSID.
   * Le webhook Messenger ne contient pas le nom — nécessite un appel Graph API.
   * Retourne null en cas d'erreur ou si le nom est absent.
   */
  async getUserName(psid: string, accessToken: string): Promise<string | null> {
    const cached = this.nameCache.get(psid);
    if (cached && cached.expiresAt > Date.now()) return cached.name;

    try {
      const url = `https://graph.facebook.com/${this.META_API_VERSION}/${psid}?fields=name&access_token=${accessToken}`;
      const response = await axios.get(url);
      const name: string | undefined = response.data?.name;
      if (name) {
        this.nameCache.set(psid, { name, expiresAt: Date.now() + 60 * 60_000 });
        return name;
      }
      return null;
    } catch (err) {
      this.logger.warn(
        `MESSENGER_GET_USER_NAME_FAILED psid=${psid}: ${String(err)}`,
        CommunicationMessengerService.name,
      );
      return null;
    }
  }

  async sendTextMessage(data: {
    text: string;
    recipientPsid: string;
    pageId: string;
    accessToken: string;
    quotedMessageId?: string;
  }): Promise<{ providerMessageId: string }> {
    const url = `https://graph.facebook.com/${this.META_API_VERSION}/me/messages`;

    const payload: Record<string, unknown> = {
      recipient: { id: data.recipientPsid },
      message: { text: data.text },
      messaging_type: 'RESPONSE',
    };

    if (data.quotedMessageId) {
      (payload.message as Record<string, unknown>).reply_to = {
        mid: data.quotedMessageId,
      };
    }

    this.logger.log(
      `MESSENGER_OUTBOUND_TEXT page=${data.pageId} to=${data.recipientPsid}`,
      CommunicationMessengerService.name,
    );

    let response: Awaited<ReturnType<typeof axios.post>>;
    try {
      response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${data.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: { message?: string; code?: number; type?: string } }>;
      const apiMsg = axiosErr.response?.data?.error?.message;
      const apiCode = axiosErr.response?.data?.error?.code;
      const status = axiosErr.response?.status;
      const detail = apiMsg
        ? `Messenger API error ${apiCode ?? status}: ${apiMsg}`
        : `Messenger API error HTTP ${status ?? 'unknown'}: ${axiosErr.message}`;
      this.logger.warn(
        `MESSENGER_SEND_FAILED page=${data.pageId} to=${data.recipientPsid} — ${detail}`,
        CommunicationMessengerService.name,
      );
      throw new Error(detail);
    }

    const messageId: string = response.data?.message_id;
    if (!messageId) {
      throw new Error(
        `Messenger API response missing message_id: ${JSON.stringify(response.data)}`,
      );
    }

    return { providerMessageId: messageId };
  }

  async sendMediaMessage(data: {
    recipientPsid: string;
    pageId: string;
    accessToken: string;
    mediaBuffer: Buffer;
    mimeType: string;
    fileName: string;
    mediaType: 'image' | 'video' | 'audio' | 'document';
  }): Promise<{ providerMessageId: string; attachmentId: string }> {
    const attachmentType = this.toMessengerAttachmentType(data.mediaType);

    // Étape 1 — uploader la pièce jointe via l'Attachment Upload API
    const uploadUrl = `https://graph.facebook.com/${this.META_API_VERSION}/me/message_attachments`;
    const form = new FormData();
    form.append(
      'message',
      JSON.stringify({
        attachment: {
          type: attachmentType,
          payload: { is_reusable: true },
        },
      }),
    );
    form.append('filedata', data.mediaBuffer, {
      filename: data.fileName,
      contentType: data.mimeType,
    });

    this.logger.log(
      `MESSENGER_OUTBOUND_MEDIA_UPLOAD page=${data.pageId} type=${data.mediaType}`,
      CommunicationMessengerService.name,
    );

    const uploadResponse = await axios.post(uploadUrl, form, {
      headers: {
        Authorization: `Bearer ${data.accessToken}`,
        ...form.getHeaders(),
      },
    });

    const attachmentId: string = uploadResponse.data?.attachment_id;
    if (!attachmentId) {
      throw new Error(
        `Messenger attachment upload missing attachment_id: ${JSON.stringify(uploadResponse.data)}`,
      );
    }

    // Étape 2 — envoyer le message avec l'attachment_id
    const sendUrl = `https://graph.facebook.com/${this.META_API_VERSION}/me/messages`;
    const sendPayload = {
      recipient: { id: data.recipientPsid },
      message: {
        attachment: {
          type: attachmentType,
          payload: { attachment_id: attachmentId },
        },
      },
      messaging_type: 'RESPONSE',
    };

    const sendResponse = await axios.post(sendUrl, sendPayload, {
      headers: {
        Authorization: `Bearer ${data.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const messageId: string = sendResponse.data?.message_id;
    if (!messageId) {
      throw new Error(
        `Messenger send response missing message_id: ${JSON.stringify(sendResponse.data)}`,
      );
    }

    this.logger.log(
      `MESSENGER_OUTBOUND_MEDIA_SENT page=${data.pageId} to=${data.recipientPsid} mid=${messageId}`,
      CommunicationMessengerService.name,
    );

    return { providerMessageId: messageId, attachmentId };
  }

  async downloadMedia(
    messageId: string,
    accessToken: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
      const metaUrl = `https://graph.facebook.com/${this.META_API_VERSION}/${messageId}?fields=attachments`;
      const metaResponse = await axios.get(metaUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const attachments: Array<{ payload?: { url?: string } }> =
        metaResponse.data?.attachments?.data ?? [];
      const attachmentUrl = attachments[0]?.payload?.url ?? null;
      if (!attachmentUrl) return null;

      const downloadResponse = await axios.get(attachmentUrl, {
        responseType: 'arraybuffer',
      });

      const buffer = Buffer.from(downloadResponse.data);
      const mimeType =
        (downloadResponse.headers['content-type'] as string | undefined) ??
        'application/octet-stream';
      return { buffer, mimeType };
    } catch (error) {
      this.logger.warn(
        `MESSENGER_MEDIA_DOWNLOAD_FAILED messageId=${messageId}`,
        CommunicationMessengerService.name,
      );
      return null;
    }
  }

  private toMessengerAttachmentType(
    mediaType: 'image' | 'video' | 'audio' | 'document',
  ): string {
    switch (mediaType) {
      case 'image':
        return 'image';
      case 'video':
        return 'video';
      case 'audio':
        return 'audio';
      case 'document':
        return 'file';
    }
  }
}
