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

    // ── Méthode 1 : Conversations API ────────────────────────────────────────
    // Nécessite uniquement pages_messaging (déjà requis pour envoyer/recevoir).
    // Évite d'avoir besoin de pages_read_engagement pour lire le profil direct.
    // GET /me/conversations?user_id={psid}&fields=participants.fields(name)
    const nameFromConversations = await this.resolveNameFromConversations(
      psid,
      pageId,
      effectiveToken,
    );
    if (nameFromConversations) {
      this.nameCache.set(psid, { name: nameFromConversations, expiresAt: Date.now() + 60 * 60_000 });
      this.logger.log(
        `MESSENGER_NAME_RESOLVED_CONV psid=${psid} name="${nameFromConversations}"`,
        CommunicationMessengerService.name,
      );
      return nameFromConversations;
    }

    // ── Méthode 2 : Profil direct ─────────────────────────────────────────────
    // Requiert pages_read_engagement. Utilisé en fallback si la méthode 1 échoue.
    try {
      const response = await axios.get<{
        name?: string;
        first_name?: string;
        last_name?: string;
      }>(
        `https://graph.facebook.com/${this.META_API_VERSION}/${psid}`,
        {
          params: { fields: 'name,first_name,last_name', access_token: effectiveToken },
          timeout: 5_000,
        },
      );

      const data = response.data;
      const name =
        data?.name?.trim() ||
        [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim() ||
        null;

      if (name) {
        this.nameCache.set(psid, { name, expiresAt: Date.now() + 60 * 60_000 });
        this.logger.log(
          `MESSENGER_NAME_RESOLVED_DIRECT psid=${psid} name="${name}"`,
          CommunicationMessengerService.name,
        );
        return name;
      }

      this.logger.warn(
        `MESSENGER_NAME_EMPTY psid=${psid} — Aucun champ de nom disponible. Vérifiez que l'app a la permission pages_read_engagement ou pages_messaging.`,
        CommunicationMessengerService.name,
      );
      return null;
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: { message?: string; code?: number; type?: string } }>;
      const apiError = axiosErr.response?.data?.error;
      const detail = apiError
        ? `code=${apiError.code} type=${apiError.type ?? '-'}: ${apiError.message}`
        : String(err);
      this.logger.warn(
        `MESSENGER_GET_USER_NAME_FAILED psid=${psid} — ${detail}`,
        CommunicationMessengerService.name,
      );
      return null;
    }
  }

  /**
   * Récupère le nom d'un utilisateur Messenger via l'API Conversations.
   * Requiert uniquement pages_messaging (pas de permission supplémentaire).
   * Cherche dans les conversations récentes de la page l'entrée correspondant au PSID.
   */
  private async resolveNameFromConversations(
    psid: string,
    pageId: string | undefined,
    effectiveToken: string,
  ): Promise<string | null> {
    try {
      // "me" résout automatiquement vers la page avec un PAT.
      // user_id filtre directement la conversation avec ce PSID.
      const response = await axios.get<{
        data?: Array<{
          participants?: {
            data?: Array<{ id: string; name?: string }>;
          };
        }>;
      }>(
        `https://graph.facebook.com/${this.META_API_VERSION}/me/conversations`,
        {
          params: {
            user_id: psid,
            fields: 'participants',
            access_token: effectiveToken,
          },
          timeout: 5_000,
        },
      );

      const conversations = response.data?.data ?? [];
      if (conversations.length === 0) return null;

      const participants = conversations[0].participants?.data ?? [];
      // L'entrée du participant qui n'est PAS la page Facebook = le client
      const user = participants.find((p) => p.id !== pageId && p.name?.trim());
      return user?.name?.trim() ?? null;
    } catch {
      // Silencieux : on passe à la méthode 2
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

    // Dériver le Page Access Token si le token stocké est un User/System User Token.
    // Même logique que getUserName — nécessaire pour les auto-messages et les envois depuis l'admin.
    const effectiveToken =
      (await this.derivePageAccessToken(data.pageId, data.accessToken)) ?? data.accessToken;

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
      `MESSENGER_OUTBOUND_TEXT url=${url} page=${data.pageId} to=${data.recipientPsid} token_prefix=${effectiveToken?.slice(0, 12)}...`,
      CommunicationMessengerService.name,
    );

    const response = await axios
      .post<{ message_id?: string }>(url, payload, {
        headers: {
          Authorization: `Bearer ${effectiveToken}`,
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

    // Dériver le Page Access Token si le token stocké est un User/System User Token.
    const effectiveToken =
      (await this.derivePageAccessToken(data.pageId, data.accessToken)) ?? data.accessToken;

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
        Authorization: `Bearer ${effectiveToken}`,
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
        Authorization: `Bearer ${effectiveToken}`,
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
