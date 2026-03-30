import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class CommunicationMessengerService {
  private readonly META_API_VERSION =
    process.env.META_API_VERSION ?? 'v21.0';

  constructor(private readonly logger: AppLogger) {}

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

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${data.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

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
