import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MessageDirection,
  WhatsappMessage,
  WhatsappMessageStatus,
} from '../entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import {
  WhatsappMedia,
  WhatsappMediaType,
} from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { WhapiOutboundError } from 'src/communication_whapi/errors/whapi-outbound.error';
import { ChannelService } from 'src/channel/channel.service';

/**
 * Envoi de messages sortants (texte, médias) et typing indicators.
 */
@Injectable()
export class OutboundMessageService {
  private readonly logger = new Logger(OutboundMessageService.name);

  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,
    @InjectRepository(WhatsappMedia)
    private readonly mediaRepository: Repository<WhatsappMedia>,
    private readonly chatService: WhatsappChatService,
    private readonly communicationWhapiService: CommunicationWhapiService,
    private readonly outboundRouter: OutboundRouterService,
    private readonly channelService: ChannelService,
    private readonly configService: ConfigService,
  ) {}

  async createAgentMessage(data: {
    chat_id: string;
    text: string;
    poste_id: string | null;
    timestamp: Date;
    commercial_id?: string | null;
    channel_id: string;
    /** DB UUID du message à citer (fonctionnalité reply) */
    quotedMessageId?: string;
  }): Promise<WhatsappMessage> {
    const traceId = this.buildTraceId(undefined, data.chat_id);
    let chat: WhatsappChat | null = null;
    let commercial: WhatsappCommercial | null = null;
    try {
      this.logger.log(
        `OUTBOUND_REQUEST trace=${traceId} chat_id=${data.chat_id}`,
      );
      chat = await this.chatService.findBychat_id(data.chat_id);
      if (!chat) throw new Error('Chat not found');
      if (data.commercial_id) {
        commercial = await this.commercialRepository.findOne({
          where: { id: data.commercial_id },
        });
      }

      const lastInboundMessage = await this.messageRepository.findOne({
        where: { chat_id: data.chat_id, direction: MessageDirection.IN },
        order: { timestamp: 'DESC' },
      });

      if (lastInboundMessage) {
        const diff =
          new Date().getTime() - new Date(lastInboundMessage.timestamp).getTime();
        const diffHours = Math.ceil(diff / (1000 * 60 * 60));
        if (diffHours > this.getResponseTimeoutHours()) {
          throw new Error(
            `RESPONSE_TIMEOUT_EXCEEDED: La fenêtre de réponse WhatsApp (${this.getResponseTimeoutHours()}h) est expirée`,
          );
        }
      }

      function extractPhoneNumber(chat_id: string): string {
        return chat_id.split('@')[0];
      }

      let quotedMsg: WhatsappMessage | null = null;
      if (data.quotedMessageId) {
        quotedMsg = await this.messageRepository.findOne({
          where: { id: data.quotedMessageId },
        });
      }

      const sendResponse = await this.outboundRouter.sendTextMessage({
        to: extractPhoneNumber(chat.chat_id),
        text: data.text,
        channelId: data.channel_id,
        quotedProviderMessageId:
          quotedMsg?.provider_message_id ?? quotedMsg?.message_id ?? undefined,
      });
      this.logger.log(
        `OUTBOUND_PROVIDER_OK trace=${traceId} provider=${sendResponse.provider} external_id=${sendResponse.providerMessageId ?? 'unknown'}`,
      );

      const channel = await this.channelService.findOne(data.channel_id);
      if (!channel) {
        throw new NotFoundException('Channel not found');
      }

      const messageEntity = this.messageRepository.create({
        message_id: sendResponse.providerMessageId ?? `agent_${Date.now()}`,
        external_id: sendResponse.providerMessageId,
        provider: sendResponse.provider,
        provider_message_id: sendResponse.providerMessageId,
        poste_id: data.poste_id,
        direction: MessageDirection.OUT,
        from_me: true,
        timestamp: data.timestamp,
        status: WhatsappMessageStatus.SENT,
        source: 'agent_web',
        text: data.text,
        chat: chat,
        poste: chat.poste ?? undefined,
        from: extractPhoneNumber(chat.chat_id),
        from_name: chat.name,
        channel: channel,
        commercial: commercial,
        contact: null,
        quotedMessage: quotedMsg ?? undefined,
      });

      const mes = await this.messageRepository.save(messageEntity);
      this.logger.log(
        `OUTBOUND_PERSISTED trace=${traceId} db_message_id=${mes.id}`,
      );
      await this.chatRepository.update(
        { chat_id: chat.chat_id },
        {
          unread_count: 0,
          ...(data.poste_id
            ? { last_poste_message_at: messageEntity.createdAt }
            : {}),
          last_activity_at: new Date(),
          read_only: true,
        },
      );

      return mes;
    } catch (error) {
      if (error instanceof WhapiOutboundError && chat) {
        await this.persistFailedAgentMessage(data, chat, commercial);
      }
      this.logger.error(
        `OUTBOUND_FAILED trace=${traceId} chat_id=${data.chat_id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async createAgentMediaMessage(data: {
    chat_id: string;
    poste_id: string;
    timestamp: Date;
    commercial_id?: string | null;
    channel_id: string;
    mediaBuffer: Buffer;
    mimeType: string;
    fileName: string;
    mediaType: 'image' | 'video' | 'audio' | 'document';
    caption?: string;
  }): Promise<WhatsappMessage> {
    const traceId = this.buildTraceId(undefined, data.chat_id);
    let chat: WhatsappChat | null = null;
    let commercial: WhatsappCommercial | null = null;
    try {
      this.logger.log(
        `OUTBOUND_MEDIA_REQUEST trace=${traceId} chat_id=${data.chat_id} type=${data.mediaType}`,
      );
      chat = await this.chatService.findBychat_id(data.chat_id);
      if (!chat) throw new Error('Chat not found');
      if (data.commercial_id) {
        commercial = await this.commercialRepository.findOne({
          where: { id: data.commercial_id },
        });
      }

      const lastInboundMessage = await this.messageRepository.findOne({
        where: { chat_id: data.chat_id, direction: MessageDirection.IN },
        order: { timestamp: 'DESC' },
      });
      if (lastInboundMessage) {
        const diff =
          new Date().getTime() -
          new Date(lastInboundMessage.timestamp).getTime();
        const diffHours = Math.ceil(diff / (1000 * 60 * 60));
        if (diffHours > this.getResponseTimeoutHours()) {
          throw new Error(
            `RESPONSE_TIMEOUT_EXCEEDED: La fenêtre de réponse WhatsApp (${this.getResponseTimeoutHours()}h) est expirée`,
          );
        }
      }

      function extractPhoneNumber(chat_id: string): string {
        return chat_id.split('@')[0];
      }

      const sendResponse = await this.outboundRouter.sendMediaMessage({
        to: extractPhoneNumber(chat.chat_id),
        channelId: data.channel_id,
        mediaBuffer: data.mediaBuffer,
        mimeType: data.mimeType,
        fileName: data.fileName,
        mediaType: data.mediaType,
        caption: data.caption,
      });
      this.logger.log(
        `OUTBOUND_MEDIA_OK trace=${traceId} provider=${sendResponse.provider} media=${data.mediaType} external_id=${sendResponse.providerMessageId ?? 'unknown'}`,
      );

      const channel = await this.channelService.findOne(data.channel_id);
      if (!channel) {
        throw new NotFoundException('Channel not found');
      }

      const messageEntity = this.messageRepository.create({
        message_id: sendResponse.providerMessageId ?? `agent_${Date.now()}`,
        external_id: sendResponse.providerMessageId,
        provider: sendResponse.provider,
        provider_message_id: sendResponse.providerMessageId,
        poste_id: data.poste_id,
        direction: MessageDirection.OUT,
        from_me: true,
        timestamp: data.timestamp,
        status: WhatsappMessageStatus.SENT,
        source: 'agent_web',
        text: data.caption ?? '',
        type: data.mediaType,
        chat: chat,
        poste: chat.poste ?? undefined,
        from: extractPhoneNumber(chat.chat_id),
        from_name: chat.name,
        channel: channel,
        commercial: commercial,
        contact: null,
      });

      const savedMessage = await this.messageRepository.save(messageEntity);

      let resolvedMediaUrl: string | null = null;
      const channelQuery = `?channelId=${encodeURIComponent(channel.channel_id)}`;
      if (sendResponse.provider === 'meta' && sendResponse.providerMediaId) {
        resolvedMediaUrl = `/messages/media/meta/${sendResponse.providerMediaId}${channelQuery}`;
      } else if (sendResponse.provider === 'whapi') {
        resolvedMediaUrl = `/messages/media/whapi/${sendResponse.providerMessageId}${channelQuery}`;
      }

      const mediaEntity = this.mediaRepository.create({
        media_id: `agent_media_${Date.now()}`,
        provider_media_id: sendResponse.providerMediaId ?? null,
        whapi_media_id:
          sendResponse.providerMediaId ??
          sendResponse.providerMessageId ??
          `agent_${Date.now()}`,
        media_type: data.mediaType as WhatsappMediaType,
        mime_type: data.mimeType,
        file_name: data.fileName,
        file_size: String(data.mediaBuffer.length),
        url: resolvedMediaUrl,
        caption: data.caption ?? null,
        view_once: '0',
        message: savedMessage,
        chat: chat,
        channel: channel,
        tenant_id: chat.tenant_id,
        provider: sendResponse.provider,
      });
      await this.mediaRepository.save(mediaEntity);

      this.logger.log(
        `OUTBOUND_MEDIA_PERSISTED trace=${traceId} db_message_id=${savedMessage.id}`,
      );

      await this.chatRepository.update(
        { chat_id: chat.chat_id },
        {
          unread_count: 0,
          last_poste_message_at: messageEntity.createdAt,
          last_activity_at: new Date(),
          read_only: true,
        },
      );

      const result = await this.messageRepository.findOne({
        where: { id: savedMessage.id },
        relations: ['chat', 'medias', 'channel', 'poste', 'commercial'],
      });
      return result!;
    } catch (error) {
      this.logger.error(
        `OUTBOUND_MEDIA_FAILED trace=${traceId} chat_id=${data.chat_id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async typingStart(chat_id: string): Promise<void> {
    await this.communicationWhapiService.sendTyping(chat_id, true);
  }

  async typingStop(chat_id: string): Promise<void> {
    await this.communicationWhapiService.sendTyping(chat_id, false);
  }

  private async persistFailedAgentMessage(
    data: {
      chat_id: string;
      text: string;
      poste_id: string | null;
      timestamp: Date;
      commercial_id?: string | null;
      channel_id: string;
    },
    chat: WhatsappChat,
    commercial: WhatsappCommercial | null,
  ): Promise<void> {
    const channel = await this.channelService.findOne(data.channel_id);
    if (!channel) {
      return;
    }

    const failedMessage = this.messageRepository.create({
      message_id: `failed_${Date.now()}`,
      external_id: undefined,
      poste_id: data.poste_id,
      direction: MessageDirection.OUT,
      from_me: true,
      timestamp: data.timestamp,
      status: WhatsappMessageStatus.FAILED,
      source: 'agent_web',
      text: data.text,
      chat,
      poste: chat.poste ?? undefined,
      from: chat.contact_client?.split('@')[0] ?? chat.chat_id.split('@')[0],
      from_name: chat.name,
      channel,
      commercial,
      contact: null,
    });

    await this.messageRepository.save(failedMessage);
  }

  private getResponseTimeoutHours(): number {
    const parsed = Number(
      this.configService.get<string>('MESSAGE_RESPONSE_TIMEOUT_HOURS') ?? 24,
    );
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
  }

  private buildTraceId(messageId?: string | null, chatId?: string): string {
    return messageId ?? `chat:${chatId ?? 'unknown'}:${Date.now()}`;
  }
}
