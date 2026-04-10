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
  /** Cache PAT dérivés : évite de rappeler /{pageId}?fields=access_token à chaque message */
  private readonly patCache = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly logger: AppLogger) {}

  /**
   * Dérive un Page Access Token depuis un User/System User Token.
   * Nécessaire quand le token stocké n'est pas un PAT direct.
   * Résultat mis en cache 23h (PAT System User = permanent, PAT User = ~1h mais on garde 23h comme seuil safe).
   */
  private async derivePageAccessToken(pageId: string, userToken: string): Promise<string | null> {
    const cached = this.patCache.get(pageId);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    try {
      const response = await axios.get<{ access_token?: string }>(
        `https://graph.facebook.com/${this.META_API_VERSION}/${pageId}`,
        { params: { fields: 'access_token', access_token: userToken } },
      );
      const pat = response.data?.access_token;
      if (pat) {
        this.patCache.set(pageId, { token: pat, expiresAt: Date.now() + 23 * 60 * 60_000 });
        this.logger.log(
          `MESSENGER_PAT_DERIVED pageId=${pageId}`,
          CommunicationMessengerService.name,
        );
        return pat;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Récupère le nom complet d'un utilisateur Messenger via son PSID.
   * Si le token fourni est un User/System User Token, tente d'abord de dériver le PAT.
   * Le webhook Messenger ne contient pas le nom — nécessite un appel Graph API.
   * Retourne null en cas d'erreur ou si le nom est absent.
   */
  async getUserName(psid: string, accessToken: string, pageId?: string): Promise<string | null> {
    // Clé cache = psid seul (le PSID est déjà scopé à la page côté Meta)
    const cached = this.nameCache.get(psid);
    if (cached && cached.expiresAt > Date.now()) return cached.name;

    // Si un pageId est fourni, tenter de dériver un PAT (transparent si déjà un PAT)
    const effectiveToken = pageId
      ? (await this.derivePageAccessToken(pageId, accessToken)) ?? accessToken
      : accessToken;

    try {
      const response = await axios.get<{ name?: string }>(
        `https://graph.facebook.com/${this.META_API_VERSION}/${psid}`,
        { params: { fields: 'name', access_token: effectiveToken } },
      );
      const name = response.data?.name;
      if (name) {
        this.nameCache.set(psid, { name, expiresAt: Date.now() + 60 * 60_000 });
        this.logger.log(
          `MESSENGER_NAME_RESOLVED psid=${psid} name="${name}"`,
          CommunicationMessengerService.name,
        );
        return name;
      }
      return null;
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: { message?: string; code?: number } }>;
      const detail = axiosErr.response?.data?.error?.message ?? String(err);
      this.logger.warn(
        `MESSENGER_GET_USER_NAME_FAILED psid=${psid} — ${detail}`,
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
    // Utiliser l'ID de page explicite — "me" ne fonctionne qu'avec un Page Access Token pur.
    // Avec un User Access Token échangé, "me" pointe vers l'utilisateur → erreur 100.
    const url = `https://graph.facebook.com/${this.META_API_VERSION}/${data.pageId}/messages`;

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
      `MESSENGER_OUTBOUND_TEXT url=${url} page=${data.pageId} to=${data.recipientPsid} token_prefix=${data.accessToken?.slice(0, 12)}...`,
      CommunicationMessengerService.name,
    );

    const response = await axios
      .post<{ message_id?: string }>(url, payload, {
        headers: {
          Authorization: `Bearer ${data.accessToken}`,
          'Content-Type': 'application/json',
        },
      })
      .catch((err: AxiosError<{ error?: { message?: string; code?: number; type?: string; error_subcode?: number; fbtrace_id?: string } }>) => {
        const apiErr = err.response?.data?.error;
        const detail = apiErr
          ? `Messenger API error ${apiErr.code}/${apiErr.error_subcode ?? '-'}: ${apiErr.message} (fbtrace=${apiErr.fbtrace_id ?? 'n/a'})`
          : `Messenger API HTTP ${err.response?.status ?? 'unknown'}: ${err.message}`;
        this.logger.warn(
          `MESSENGER_SEND_FAILED page=${data.pageId} to=${data.recipientPsid} — ${detail}`,
          CommunicationMessengerService.name,
        );
        throw new Error(detail);
      });

    const messageId = response.data?.message_id;
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
    const uploadUrl = `https://graph.facebook.com/${this.META_API_VERSION}/${data.pageId}/message_attachments`;
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
    const sendUrl = `https://graph.facebook.com/${this.META_API_VERSION}/${data.pageId}/messages`;
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
