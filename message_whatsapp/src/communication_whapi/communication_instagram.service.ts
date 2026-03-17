import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class CommunicationInstagramService {
  private readonly META_API_VERSION =
    process.env.META_API_VERSION ?? 'v21.0';

  constructor(private readonly logger: AppLogger) {}

  async sendTextMessage(data: {
    text: string;
    recipientIgsid: string;
    accessToken: string;
    quotedMessageId?: string;
  }): Promise<{ providerMessageId: string }> {
    const url = `https://graph.facebook.com/${this.META_API_VERSION}/me/messages`;

    const payload: Record<string, unknown> = {
      recipient: { id: data.recipientIgsid },
      message: { text: data.text },
    };

    if (data.quotedMessageId) {
      (payload.message as Record<string, unknown>).reply_to = {
        mid: data.quotedMessageId,
      };
    }

    this.logger.log(
      `INSTAGRAM_OUTBOUND_TEXT to=${data.recipientIgsid}`,
      CommunicationInstagramService.name,
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
        `Instagram API response missing message_id: ${JSON.stringify(response.data)}`,
      );
    }

    return { providerMessageId: messageId };
  }

  async sendMediaMessage(data: {
    recipientIgsid: string;
    accessToken: string;
    mediaBuffer: Buffer;
    mimeType: string;
    fileName: string;
    mediaType: 'image' | 'video' | 'audio' | 'document';
    caption?: string;
  }): Promise<{ providerMessageId: string; attachmentId: string }> {
    if (data.mediaType === 'audio') {
      throw new BadRequestException(
        "Instagram Graph API ne supporte pas l'envoi d'audio en DM",
      );
    }

    const attachmentType = this.toInstagramAttachmentType(data.mediaType);

    // Étape 1 — uploader via l'Attachment Upload API
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
      `INSTAGRAM_OUTBOUND_MEDIA_UPLOAD to=${data.recipientIgsid} type=${data.mediaType}`,
      CommunicationInstagramService.name,
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
        `Instagram attachment upload missing attachment_id: ${JSON.stringify(uploadResponse.data)}`,
      );
    }

    // Étape 2 — envoyer le message
    const sendUrl = `https://graph.facebook.com/${this.META_API_VERSION}/me/messages`;
    const sendPayload: Record<string, unknown> = {
      recipient: { id: data.recipientIgsid },
      message: {
        attachment: {
          type: attachmentType,
          payload: { attachment_id: attachmentId },
        },
      },
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
        `Instagram send response missing message_id: ${JSON.stringify(sendResponse.data)}`,
      );
    }

    this.logger.log(
      `INSTAGRAM_OUTBOUND_MEDIA_SENT to=${data.recipientIgsid} mid=${messageId}`,
      CommunicationInstagramService.name,
    );

    return { providerMessageId: messageId, attachmentId };
  }

  private toInstagramAttachmentType(
    mediaType: 'image' | 'video' | 'document',
  ): string {
    switch (mediaType) {
      case 'image':
        return 'image';
      case 'video':
        return 'video';
      case 'document':
        return 'file';
    }
  }
}
