import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class CommunicationTelegramService {
  constructor(private readonly logger: AppLogger) {}

  private apiUrl(token: string, method: string): string {
    return `https://api.telegram.org/bot${token}/${method}`;
  }

  // ─── Setup ────────────────────────────────────────────────────────────────

  async getMe(
    token: string,
  ): Promise<{ id: number; username: string; first_name: string }> {
    const response = await axios.get(this.apiUrl(token, 'getMe'));
    if (!response.data?.ok) {
      throw new Error(
        `Telegram getMe failed: ${response.data?.description ?? 'unknown'}`,
      );
    }
    return response.data.result;
  }

  async registerWebhook(
    token: string,
    webhookUrl: string,
    secretToken?: string,
  ): Promise<void> {
    const secret = secretToken ?? process.env.TELEGRAM_WEBHOOK_SECRET;
    const payload: Record<string, unknown> = {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    };
    if (secret) {
      payload.secret_token = secret;
    }

    const response = await axios.post(
      this.apiUrl(token, 'setWebhook'),
      payload,
      { headers: { 'Content-Type': 'application/json' } },
    );

    if (!response.data?.ok) {
      throw new Error(
        `Telegram setWebhook failed: ${response.data?.description ?? 'unknown'}`,
      );
    }

    this.logger.log(
      `TELEGRAM_WEBHOOK_REGISTERED url=${webhookUrl}`,
      CommunicationTelegramService.name,
    );
  }

  async resolveFileUrl(
    fileId: string,
    token: string,
  ): Promise<string | null> {
    try {
      const response = await axios.get(
        this.apiUrl(token, `getFile?file_id=${fileId}`),
      );
      const filePath: string | undefined = response.data?.result?.file_path;
      if (!filePath) return null;
      return `https://api.telegram.org/file/bot${token}/${filePath}`;
    } catch {
      return null;
    }
  }

  // ─── Outbound ────────────────────────────────────────────────────────────

  async sendTextMessage(data: {
    text: string;
    chatId: string;
    botToken: string;
    quotedMessageId?: string;
  }): Promise<{ providerMessageId: string }> {
    const numericChatId = data.chatId.includes('@')
      ? data.chatId.split('@')[0]
      : data.chatId;

    const payload: Record<string, unknown> = {
      chat_id: numericChatId,
      text: data.text,
    };

    if (data.quotedMessageId && !data.quotedMessageId.startsWith('cbq_')) {
      payload.reply_to_message_id = Number(data.quotedMessageId);
    }

    this.logger.log(
      `TELEGRAM_OUTBOUND_TEXT chat=${numericChatId}`,
      CommunicationTelegramService.name,
    );

    const response = await axios.post(
      this.apiUrl(data.botToken, 'sendMessage'),
      payload,
      { headers: { 'Content-Type': 'application/json' } },
    );

    if (!response.data?.ok) {
      throw new Error(
        `Telegram sendMessage failed: ${response.data?.description ?? 'unknown'}`,
      );
    }

    return { providerMessageId: String(response.data.result.message_id) };
  }

  async sendMediaMessage(data: {
    chatId: string;
    botToken: string;
    mediaBuffer: Buffer;
    mimeType: string;
    fileName: string;
    mediaType: 'image' | 'video' | 'audio' | 'voice' | 'document';
    caption?: string;
    quotedMessageId?: string;
  }): Promise<{ providerMessageId: string }> {
    const numericChatId = data.chatId.includes('@')
      ? data.chatId.split('@')[0]
      : data.chatId;

    const { method, fieldName } = this.resolveMediaMethod(data.mediaType);

    const form = new FormData();
    form.append('chat_id', numericChatId);
    form.append(fieldName, data.mediaBuffer, {
      filename: data.fileName,
      contentType: data.mimeType,
    });

    if (data.caption) {
      form.append('caption', data.caption);
    }

    if (
      data.quotedMessageId &&
      !data.quotedMessageId.startsWith('cbq_')
    ) {
      form.append('reply_to_message_id', data.quotedMessageId);
    }

    this.logger.log(
      `TELEGRAM_OUTBOUND_MEDIA chat=${numericChatId} type=${data.mediaType}`,
      CommunicationTelegramService.name,
    );

    const response = await axios.post(
      this.apiUrl(data.botToken, method),
      form,
      { headers: form.getHeaders() },
    );

    if (!response.data?.ok) {
      throw new Error(
        `Telegram ${method} failed: ${response.data?.description ?? 'unknown'}`,
      );
    }

    return { providerMessageId: String(response.data.result.message_id) };
  }

  private resolveMediaMethod(
    mediaType: 'image' | 'video' | 'audio' | 'voice' | 'document',
  ): { method: string; fieldName: string } {
    switch (mediaType) {
      case 'image':
        return { method: 'sendPhoto', fieldName: 'photo' };
      case 'video':
        return { method: 'sendVideo', fieldName: 'video' };
      case 'audio':
        return { method: 'sendAudio', fieldName: 'audio' };
      case 'voice':
        return { method: 'sendVoice', fieldName: 'voice' };
      case 'document':
        return { method: 'sendDocument', fieldName: 'document' };
    }
  }
}
