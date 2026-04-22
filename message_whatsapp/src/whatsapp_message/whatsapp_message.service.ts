import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  MessageDirection,
  WhatsappMessage,
  WhatsappMessageStatus,
} from './entities/whatsapp_message.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, MoreThanOrEqual, QueryFailedError, Repository } from 'typeorm';

import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { WhapiOutboundError } from 'src/communication_whapi/errors/whapi-outbound.error';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhapiMessage } from 'src/whapi/interface/whapi-webhook.interface';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CreateWhatsappMessageDto } from './dto/create-whatsapp_message.dto';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { ChannelService } from 'src/channel/channel.service';
import { ContactService } from 'src/contact/contact.service';
import { ExceptionsHandler } from '@nestjs/core/exceptions/exceptions-handler';
import { UnifiedMessage } from 'src/webhooks/normalization/unified-message';
import {
  WhatsappMedia,
  WhatsappMediaType,
} from 'src/whatsapp_media/entities/whatsapp_media.entity';

@Injectable()
export class WhatsappMessageService {
  private readonly WHAPI_URL = 'https://gate.whapi.cloud/messages/text';
  private readonly WHAPI_TOKEN = process.env.WHAPI_TOKEN;

  private readonly logger = new Logger(WhatsappMessageService.name);

  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    private readonly chatService: WhatsappChatService,
    private readonly communicationWhapiService: CommunicationWhapiService,
    private readonly outboundRouter: OutboundRouterService,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,
    private readonly channelService: ChannelService,
    private readonly contactService: ContactService,

    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    @InjectRepository(WhatsappMedia)
    private readonly mediaRepository: Repository<WhatsappMedia>,
  ) {}

  private resolveIncomingText(message: WhapiMessage): string {
    if (typeof message.text === 'string') {
      return message.text;
    }
    if (message.text?.body) {
      return message.text.body;
    }

    switch (message.type) {
      case 'image':
        return message.image?.caption ?? '[Photo]';
      case 'video':
      case 'gif':
      case 'short':
        return message.video?.caption ?? '[Video]';
      case 'audio':
      case 'voice':
        return '[Message vocal client]';
      case 'document':
        return message.document?.filename ?? '[Document]';
      case 'location':
      case 'live_location':
        return '[Localisation client]';
      case 'interactive':
      case 'buttons':
      case 'list':
        return '[Reponse interactive client]';
      default:
        return '[Message client]';
    }
  }

  private resolveIncomingTextUnified(message: UnifiedMessage): string {
    if (message.text) {
      return message.text;
    }
    switch (message.type) {
      case 'image':
        return message.media?.caption ?? '[Photo]';
      case 'video':
      case 'gif':
      case 'short':
        return message.media?.caption ?? '[Video]';
      case 'audio':
      case 'voice':
        return '[Message vocal client]';
      case 'document':
        return message.media?.fileName ?? '[Document]';
      case 'location':
      case 'live_location':
        return '[Localisation client]';
      case 'interactive':
      case 'button':
        return message.interactive?.title ?? '[Reponse interactive client]';
      default:
        return '[Message client]';
    }
  }

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

      const lastInboundMessage = await this.findLastInboundMessageBychat_id(data.chat_id);

      if (lastInboundMessage) {
        const now = new Date();
        const lastMessageDate = new Date(lastInboundMessage.timestamp);
        const diff = now.getTime() - lastMessageDate.getTime();
        const diffHours = Math.ceil(diff / (1000 * 60 * 60));
        if (diffHours > this.getResponseTimeoutHours()) {
          throw new Error(
            `RESPONSE_TIMEOUT_EXCEEDED: La fenêtre de réponse (${this.getResponseTimeoutHours()}h) est expirée`,
          );
        }
      }
      // 1️⃣ Envoi réel vers WhatsApp (routage Whapi / Meta)
      function extractPhoneNumber(chat_id: string): string {
        return chat_id.split('@')[0];
      }

      // Charger le message quoté pour récupérer son provider_message_id
      let quotedMsg: WhatsappMessage | null = null;
      if (data.quotedMessageId) {
        quotedMsg = await this.messageRepository.findOne({
          where: { id: data.quotedMessageId },
        });
      }

      const sendResponse = await this.outboundRouter.sendTextMessage({
        to: extractPhoneNumber(chat?.chat_id),
        text: data.text,
        channelId: data.channel_id,
        quotedProviderMessageId: quotedMsg?.provider_message_id ?? quotedMsg?.message_id ?? undefined,
      });
      this.logger.log(
        `OUTBOUND_PROVIDER_OK trace=${traceId} provider=${sendResponse.provider} external_id=${sendResponse.providerMessageId ?? 'unknown'}`,
      );

      const channel = await this.channelService.findOne(data.channel_id);
      if (!channel) {
        throw new NotFoundException('Channel not found');
      }

      // 2️⃣ Création message DB
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
        from: extractPhoneNumber(chat?.chat_id),
        from_name: chat.name,
        channel: channel,
        commercial: commercial,
        contact: null,
        quotedMessage: quotedMsg ?? undefined,
        dedicated_channel_id: channel.poste_id ? channel.channel_id : null,
      });

      const mes = await this.messageRepository.save(messageEntity);
      this.logger.log(
        `OUTBOUND_PERSISTED trace=${traceId} db_message_id=${mes.id}`,
      );
      await this.chatRepository.update(
        { chat_id: chat.chat_id },
        {
          // unread_count remis à 0 uniquement quand un vrai agent humain répond.
          // Les messages auto ne comptent pas comme une lecture : le commercial
          // n'a pas encore vu la conversation.
          ...(data.poste_id ? { unread_count: 0 } : {}),
          // N'actualise last_poste_message_at que pour les vrais agents humains.
          // Les messages auto (poste_id = null) ne doivent pas bloquer la séquence.
          ...(data.poste_id ? { last_poste_message_at: messageEntity.createdAt } : {}),
          // Le commercial vient de répondre → lecture seule jusqu'à la prochaine réponse client
          // Exception : canal dédié → jamais en lecture seule
          ...(data.poste_id && !channel.poste_id ? { read_only: true } : {}),
          last_activity_at: new Date(),
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

      // 🧠 fallback : message en échec mais sauvegardé
      // const failedMessage = this.messageRepository.create({
      //   message_id: `failed_${Date.now()}`,
      //   chat_id: data.chat_id,
      //   poste_id: data.poste_id,
      //   direction: MessageDirection.OUT,
      //   from_me: true,
      //   timestamp: data.timestamp,
      //   status: WhatsappMessageStatus.FAILED,
      //   source: 'agent_web',
      //   text: data.text,
      // });

      // await this.messageRepository.save(failedMessage);
      throw error;
      // throw error;
    }
  }

  async createAgentMediaMessage(data: {
    chat_id: string;
    poste_id?: string | null;
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

      const lastInboundMessage = await this.findLastInboundMessageBychat_id(data.chat_id);
      if (lastInboundMessage) {
        const now = new Date();
        const lastMessageDate = new Date(lastInboundMessage.timestamp);
        const diff = now.getTime() - lastMessageDate.getTime();
        const diffHours = Math.ceil(diff / (1000 * 60 * 60));
        if (diffHours > this.getResponseTimeoutHours()) {
          throw new Error(
            `RESPONSE_TIMEOUT_EXCEEDED: La fenêtre de réponse (${this.getResponseTimeoutHours()}h) est expirée`,
          );
        }
      }

      function extractPhoneNumber(chat_id: string): string {
        return chat_id.split('@')[0];
      }

      // 1. Send media to WhatsApp

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

      // 2. Create message entity
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
        dedicated_channel_id: channel.poste_id ? channel.channel_id : null,
      });

      const savedMessage = await this.messageRepository.save(messageEntity);

      // 3. Résoudre l'URL depuis le provider (chemins relatifs — le frontend préfixe avec NEXT_PUBLIC_API_URL)
      let resolvedMediaUrl: string | null = null;
      const channelQuery = `?channelId=${encodeURIComponent(channel.channel_id)}`;
      if (sendResponse.provider === 'meta' && sendResponse.providerMediaId) {
        resolvedMediaUrl = `/messages/media/meta/${sendResponse.providerMediaId}${channelQuery}`;
      } else if (sendResponse.provider === 'messenger' && sendResponse.providerMessageId) {
        // Messenger : proxy via GET /{messageId}?fields=attachments (Graph API)
        resolvedMediaUrl = `/messages/media/messenger/${sendResponse.providerMessageId}${channelQuery}`;
      } else if (sendResponse.provider === 'whapi') {
        // Proxy interne : évite la dépendance à l'Auto-Download Whapi et les
        // race conditions (CDN pas encore disponible au moment de l'envoi).
        resolvedMediaUrl = `/messages/media/whapi/${sendResponse.providerMessageId}${channelQuery}`;
      }

      // 4. Create media entity
      const mediaEntity = this.mediaRepository.create({
        media_id: `agent_media_${Date.now()}`,
        // Messenger : stocker le messageId (pas l'attachmentId) pour que le proxy
        // puisse le retrouver par provider_media_id = messageId.
        provider_media_id: sendResponse.provider === 'messenger'
          ? (sendResponse.providerMessageId ?? null)
          : (sendResponse.providerMediaId ?? null),
        whapi_media_id: sendResponse.providerMediaId ?? sendResponse.providerMessageId ?? `agent_${Date.now()}`,
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
          // Canal dédié → jamais en lecture seule
          ...(channel.poste_id ? {} : { read_only: true }),
          last_activity_at: new Date(),
        },
      );

      // Reload with medias relation
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
    const parsed = Number(process.env.MESSAGE_RESPONSE_TIMEOUT_HOURS ?? 24);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
  }

  async typingStart(chat_id: string) {
    await this.communicationWhapiService.sendTyping(chat_id, true);
  }

  async typingStop(chat_id: string) {
    await this.communicationWhapiService.sendTyping(chat_id, false);
  }

  async findLastMessageBychat_id(
    chat_id: string,
  ): Promise<WhatsappMessage | null> {
    try {
      const message = await this.messageRepository.findOne({
        where: { chat_id: chat_id },
        order: { timestamp: 'DESC' },
        relations: ['medias'],
      });
      return message;
    } catch (error) {
      throw new NotFoundException(new Error(error));
    }
  }

  async findLastInboundMessageBychat_id(
    chat_id: string,
  ): Promise<WhatsappMessage | null> {
    return this.messageRepository.findOne({
      where: { chat_id, direction: MessageDirection.IN },
      order: { timestamp: 'DESC' },
    });
  }

  async findByExternalId(externalId: string): Promise<WhatsappMessage | null> {
    return this.messageRepository.findOne({
      where: { external_id: externalId },
      relations: ['chat'],
    });
  }

  async findIncomingByProviderMessageId(
    provider: 'whapi' | 'meta' | 'messenger' | 'instagram' | 'telegram',
    providerMessageId: string,
  ): Promise<WhatsappMessage | null> {
    return this.messageRepository.findOne({
      where: {
        provider,
        provider_message_id: providerMessageId,
        direction: MessageDirection.IN,
      },
      relations: ['chat'],
    });
  }

  async findBychat_id(
    chat_id: string,
    limit = 50,
    before?: Date,
  ): Promise<{ messages: WhatsappMessage[]; hasMore: boolean }> {
    try {
      const qb = this.messageRepository
        .createQueryBuilder('m')
        .leftJoinAndSelect('m.chat', 'chat')
        .leftJoinAndSelect('m.poste', 'poste')
        .leftJoinAndSelect('m.medias', 'medias')
        .leftJoinAndSelect('m.quotedMessage', 'quotedMessage')
        .where('m.chat_id = :chat_id', { chat_id })
        .orderBy('m.timestamp', 'DESC')
        .addOrderBy('m.createdAt', 'DESC')
        .take(limit + 1);

      if (before) {
        qb.andWhere('m.timestamp < :before', { before });
      }

      const rows = await qb.getMany();
      const hasMore = rows.length > limit;
      if (hasMore) rows.pop();
      return { messages: rows.reverse(), hasMore };
    } catch (error) {
      throw new NotFoundException(error.message ?? error);
    }
  }

  async findLastMessagesBulk(chatIds: string[]): Promise<Map<string, WhatsappMessage>> {
    if (chatIds.length === 0) return new Map();
    const rows = await this.messageRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.medias', 'medias')
      .innerJoin(
        (sub) =>
          sub
            .select('m2.chat_id', 'cid')
            .addSelect('MAX(m2.timestamp)', 'max_ts')
            .from(WhatsappMessage, 'm2')
            .where('m2.chat_id IN (:...chatIds)', { chatIds })
            .andWhere('m2.deletedAt IS NULL')
            .groupBy('m2.chat_id'),
        'latest',
        'm.chat_id = latest.cid AND m.timestamp = latest.max_ts AND m.deletedAt IS NULL',
      )
      .where('m.chat_id IN (:...chatIds)', { chatIds })
      .getMany();
    return new Map(rows.map((m) => [m.chat_id, m]));
  }

  /**
   * Récupère les N messages les plus récents pour chaque conversation (défaut: 50).
   * Utilise ROW_NUMBER() (MySQL 8+) pour limiter par chat_id sans sous-requête corrélée.
   * Retourne une Map<chat_id, messages[]> triée par timestamp ASC (ordre d'affichage).
   */
  async findRecentByChatIds(
    chatIds: string[],
    perChatLimit = 50,
  ): Promise<Map<string, Record<string, any>[]>> {
    if (chatIds.length === 0) return new Map();

    
    const placeholders = chatIds.map(() => '?').join(',');
    const rows: Record<string, any>[] = await this.messageRepository.query(
      `SELECT id, chat_id, \`text\`, timestamp, from_me, \`from\`,
              from_name, status, direction, \`type\`, poste_id,
              commercial_id, message_id, createdAt
       FROM (
         SELECT id, chat_id, \`text\`, timestamp, from_me, \`from\`,
                from_name, status, direction, \`type\`, poste_id,
                commercial_id, message_id, createdAt,
                ROW_NUMBER() OVER (
                  PARTITION BY chat_id
                  ORDER BY timestamp DESC, createdAt DESC
                ) AS rn
         FROM whatsapp_message
         WHERE chat_id IN (${placeholders})
           AND deletedAt IS NULL
       ) ranked
       WHERE rn <= ?
       ORDER BY chat_id ASC, timestamp ASC, createdAt ASC`,
      [...chatIds, perChatLimit],
    );

    const map = new Map<string, Record<string, any>[]>();
    for (const row of rows) {
      if (!map.has(row.chat_id)) map.set(row.chat_id, []);
      map.get(row.chat_id)!.push(row);
    }
    return map;
  }

  async countUnreadMessagesBulk(chatIds: string[]): Promise<Map<string, number>> {
    if (chatIds.length === 0) return new Map();
    const rows: Array<{ chat_id: string; cnt: string }> = await this.messageRepository
      .createQueryBuilder('m')
      .select('m.chat_id', 'chat_id')
      .addSelect('COUNT(*)', 'cnt')
      .where('m.chat_id IN (:...chatIds)', { chatIds })
      .andWhere('m.from_me = :fromMe', { fromMe: false })
      .andWhere('m.status IN (:...statuses)', {
        statuses: [WhatsappMessageStatus.SENT, WhatsappMessageStatus.DELIVERED],
      })
      .andWhere('m.deletedAt IS NULL')
      .groupBy('m.chat_id')
      .getRawMany();
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.chat_id, parseInt(r.cnt) || 0);
    return map;
  }

  /* =======================
   * 👁️ MARQUER MESSAGES COMME LUS
   * ======================= */
  async markIncomingMessagesAsRead(chat_id: string): Promise<void> {
    // Ancrage explicite de `timestamp` et updatedAt pour bloquer ON UPDATE CURRENT_TIMESTAMP
    // côté MySQL (le moteur applique ON UPDATE même sur les raw queries).
    // Sans cet ancrage, MySQL ≤ 5.6 mettrait `timestamp` à NOW() (premier TIMESTAMP NOT NULL
    // sans DEFAULT explicite), ce qui corrompt l'ordre chronologique des messages.
    await this.messageRepository.query(
      `UPDATE whatsapp_message
       SET status    = 'READ',
           updatedAt = updatedAt,
           \`timestamp\` = \`timestamp\`
       WHERE chat_id = ?
         AND direction = 'IN'
         AND status != 'READ'`,
      [chat_id],
    );

    this.logger.debug(`Incoming messages marked as read for chat ${chat_id}`);
  }

  async countBychat_id(chat_id: string): Promise<number> {
    return this.messageRepository.count({ where: { chat_id } });
  }

  async countUnreadMessages(chat_id: string): Promise<number> {
    try {
      const count = await this.messageRepository.count({
        where: {
          chat_id: chat_id,
          from_me: false,
          status: In([
            WhatsappMessageStatus.SENT,
            WhatsappMessageStatus.DELIVERED,
          ]),
        },
      });
      // console.log('c=============compteur message =================', count);

      return count;
    } catch (error) {
      throw new NotFoundException(new Error(error));
    }
  }

  async createInternalMessage(message: any, commercialId?: string) {
    try {
      // console.log('message reçue du dispache', message);
      const chat = await this.chatRepository.findOne({
        where: {
          chat_id: message.chat_id,
        },
      });

      if (!chat) {
        throw new Error('Chat not found or created');
      }

      const chekMessage = await this.messageRepository.findOne({
        where: { message_id: message.id },
      });

      // assuming commercial with id "1"
      if (chekMessage) {
        // console.log('Message already exists with id:', chekMessage.id);
        return chekMessage;
      }

      const commercial = await this.commercialRepository.findOne({
        where: {
          id: commercialId,
        },
      });

      if (!commercial) {
        return null;
      }

      const data: Partial<WhatsappMessage> = {
        message_id: message.id,
        external_id: message.id,
        chat_id: message.chat_id,
        direction: message.from_me ? MessageDirection.OUT : MessageDirection.IN,
        from_me: message.from_me,
        from: message.from,
        from_name: message.from_name,
        status: WhatsappMessageStatus.DELIVERED,
        timestamp: new Date(message.timestamp * 1000),
        source: message.source,
      };

      const messageEntity = this.messageRepository.create(data);

      return this.messageRepository.save(messageEntity);
    } catch (error) {
      this.logger.error(
        'Error creating internal message',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error(`Failed to create message: ${error}`);
    }
  }

  async findAllByChatId(chat_id: string) {
    const messages = await this.messageRepository.find({
      where: { chat_id: chat_id },
      relations: {
        medias: true,
        poste: true,
        chat: true,
      },
    });
    return messages;
  }

  async findAll(limit = 50, offset = 0, dateStart?: Date): Promise<{ data: unknown[]; total: number }> {
    const where: FindOptionsWhere<WhatsappMessage> = {};
    if (dateStart) {
      where.timestamp = MoreThanOrEqual(dateStart);
    }
    const [messages, total] = await this.messageRepository.findAndCount({
      relations: {
        poste: true,
        chat: true,
        contact: true,
        commercial: true,
      },
      where,
      order: { timestamp: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data: messages, total };
  }

  async findByAllByMessageId(id: string) {
    try {
      const message = await this.messageRepository.findOne({
        where: { id: id },
      });
      if (message) {
        throw new NotFoundException('message non trouver');
      }
    } catch (err) {
      throw new Error(err);
    }
  }

  async updateByStatus(status: {
    id: string;
    recipient_id: string;
    status: string;
    errorCode?: number;
    errorTitle?: string;
  }) {
    try {
      const candidateConditions: FindOptionsWhere<WhatsappMessage>[] = [];

      if (status.recipient_id) {
        candidateConditions.push(
          { external_id: status.id, chat_id: status.recipient_id },
          { provider_message_id: status.id, chat_id: status.recipient_id },
        );
      } else {
        candidateConditions.push(
          { external_id: status.id },
          { provider_message_id: status.id },
        );
      }

      const message = await this.messageRepository.findOne({
        where: candidateConditions,
      });

      if (!message) {
        this.logger.warn(
          `Message not found for status update: ${status.id} recipient=${status.recipient_id}`,
        );
        return null;
      }

      // Les mises à jour de statut (delivered, read, failed…) ne s'appliquent
      // qu'aux messages SORTANTS (from_me = true).
      // Les messages entrants (from_me = false) ne sont marqués READ que par
      // l'action explicite du commercial (clic sur la conversation → messages:read).
      // Si on laissait passer, un webhook Whapi "read" sur un message client
      // (déclenché automatiquement à l'envoi d'une réponse) marquerait la
      // conversation comme lue sans que personne ne l'ait ouverte.
      if (!message.from_me) {
        this.logger.debug(
          `Status update ignored for inbound message: ${status.id} (from_me=false)`,
        );
        return null;
      }

      message.status = status.status as WhatsappMessageStatus;

      if (status.errorCode !== undefined) {
        message.error_code = status.errorCode;
      }
      if (status.errorTitle !== undefined) {
        message.error_title = status.errorTitle;
      }

      return await this.messageRepository.save(message);
    } catch (error) {
      this.logger.error(
        `Failed to update message status: ${status.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error(`Failed to update message status: ${String(error)}`);
    }
  }

  async saveIncomingFromWhapi(
    message: WhapiMessage,
    chat: WhatsappChat,
  ): Promise<WhatsappMessage> {
    const traceId = this.buildTraceId(message.id, message.chat_id);
    try {
      this.logger.log(
        `INCOMING_SAVE_REQUEST trace=${traceId} chat_id=${message.chat_id}`,
      );
      const existingMessage = await this.messageRepository.findOne({
        where: { message_id: message.id },
      });
      if (existingMessage) {
        this.logger.log(
          `INCOMING_DUPLICATE trace=${traceId} db_message_id=${existingMessage.id} direction=${existingMessage.direction}`,
        );
        return existingMessage;
      }

      const channel = await this.channelService.findOne(message.channel_id);
      if (!channel) {
        // Utilisez une exception métier appropriée
        throw new Error(`Channel ${message.channel_id} non trouvé`);
      }

      const contact = await this.contactService.findOrCreate(
        message.from,
        message.chat_id,
        message.from_name ?? message.from,
      );

      if (!message.from_me) {
        chat.last_msg_client_channel_id = channel.channel_id;
        chat.channel_id = channel.channel_id;
      }

      await this.chatRepository.save(chat);

      try {
        const messagesss = await this.messageRepository.save(
          this.messageRepository.create({
            channel: channel,
            chat: chat,
            contact_id: contact?.id,
            message_id: message.id,
            external_id: message.id,
            direction: MessageDirection.IN,
            from_me: message.from_me,
            from: message.from,
            from_name: message.from_name,
            text: this.resolveIncomingText(message),
            type: message.type,
            timestamp: new Date(message.timestamp * 1000),
            status: WhatsappMessageStatus.SENT,
            source: 'whapi',
            poste: chat.poste,
          }),
        );
        this.logger.log(
          `INCOMING_SAVED trace=${traceId} db_message_id=${messagesss.id}`,
        );
        return messagesss;
      } catch (error) {
        // Race condition safe path: unique constraint can be hit on retries.
        if (
          error instanceof QueryFailedError &&
          typeof (error as any).driverError?.code === 'string' &&
          ['ER_DUP_ENTRY', '23505', 'SQLITE_CONSTRAINT'].includes(
            (error as any).driverError.code,
          )
        ) {
          const duplicated = await this.messageRepository.findOne({
            where: { message_id: message.id },
          });
          if (duplicated) {
            this.logger.log(
              `INCOMING_DUPLICATE_RACE trace=${traceId} db_message_id=${duplicated.id}`,
            );
            return duplicated;
          }
        }
        throw error;
      }
    } catch (error) {
      // Log de l'erreur (important pour le débogage)
      this.logger.error(
        `INCOMING_SAVE_FAILED trace=${traceId} error=${error.message}`,
        error.stack,
      );

      // Relancez l'erreur pour la gérer plus haut
      // ou lancez une exception métier personnalisée
      throw new Error(`Impossible de sauvegarder le message: ${error.message}`);
    }
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappMessage`;
  }

  async findOneWithMedias(id: string) {
    return await this.messageRepository.findOne({
      where: { id },
      relations: {
        medias: true,
        chat: true,
        // poste et contact ne sont pas utilisés dans mapMessage → retirés (OPT-5)
        quotedMessage: {
          medias: true, // resolveMessageText en a besoin pour les messages quotés media
        },
      },
    });
  }

  private buildTraceId(messageId?: string | null, chatId?: string): string {
    return messageId ?? `chat:${chatId ?? 'unknown'}:${Date.now()}`;
  }

  async saveIncomingFromUnified(
    message: UnifiedMessage,
    chat: WhatsappChat,
  ): Promise<WhatsappMessage> {
    const traceId = this.buildTraceId(
      message.providerMessageId,
      message.chatId,
    );
    try {
      this.logger.log(
        `INCOMING_SAVE_REQUEST trace=${traceId} chat_id=${message.chatId}`,
      );
      this.logger.debug(
        `INCOMING_PROBE trace=${traceId} provider=${message.provider} providerMessageId=${message.providerMessageId} direction=${message.direction}`,
      );
      const existingMessage = await this.messageRepository.findOne({
        where: {
          provider_message_id: message.providerMessageId,
        },
      });
      if (existingMessage) {
        this.logger.log(
          `INCOMING_DUPLICATE trace=${traceId} db_message_id=${existingMessage.id}`,
        );
        return existingMessage;
      }

      // OPT-3 : channel et contact sont indépendants → chargement en parallèle
      const [channel, contact] = await Promise.all([
        this.channelService.findOne(message.channelId),
        this.contactService.findOrCreate(
          message.from,
          message.chatId,
          message.fromName ?? message.from,
        ),
      ]);

      if (!channel) {
        throw new Error(`Channel ${message.channelId} non trouve`);
      }

      // OPT-3b : mise à jour du chat et recherche du message quoté en parallèle
      const [, quotedMsg] = await Promise.all([
        message.direction === 'in'
          ? this.chatRepository
              .update(
                { id: chat.id },
                {
                  last_msg_client_channel_id: channel.channel_id,
                  channel_id: channel.channel_id,
                },
              )
              .then(() => {
                // Mutations en mémoire après l'UPDATE
                chat.last_msg_client_channel_id = channel.channel_id;
                chat.channel_id = channel.channel_id;
              })
          : Promise.resolve(),
        message.quotedProviderMessageId
          ? this.messageRepository.findOne({
              where: { provider_message_id: message.quotedProviderMessageId },
            })
          : Promise.resolve(null),
      ]);

      const buildMessageEntity = (chatRef: WhatsappChat) =>
        this.messageRepository.create({
          tenant_id: message.tenantId,
          provider: message.provider,
          provider_message_id: message.providerMessageId,
          channel: channel,
          chat: chatRef,
          contact_id: contact?.id,
          message_id: message.providerMessageId,
          external_id: message.providerMessageId,
          direction: MessageDirection.IN,
          from_me: false,
          from: message.from,
          from_name: message.fromName ?? message.from,
          text: this.resolveIncomingTextUnified(message),
          type: message.type,
          timestamp: new Date(message.timestamp * 1000),
          status: WhatsappMessageStatus.SENT,
          source: message.provider,
          poste: chatRef.poste,
          quotedMessage: quotedMsg ?? undefined,
          // Canal dédié : rempli si le channel a un poste dédié au moment de la réception
          dedicated_channel_id: channel.poste_id ? channel.channel_id : null,
        });

      try {
        const saved = await this.messageRepository.save(
          buildMessageEntity(chat),
        );
        this.logger.log(
          `INCOMING_SAVED trace=${traceId} db_message_id=${saved.id}`,
        );
        return saved;
      } catch (error) {
        const errorCode =
          error instanceof QueryFailedError &&
          typeof (error as any).driverError?.code === 'string'
            ? (error as any).driverError.code
            : null;

        // ER_DUP_ENTRY: message already saved (concurrent insert)
        if (
          errorCode &&
          ['ER_DUP_ENTRY', '23505', 'SQLITE_CONSTRAINT'].includes(errorCode)
        ) {
          const duplicated = await this.messageRepository.findOne({
            where: {
              provider_message_id: message.providerMessageId,
              provider: message.provider,
              direction: MessageDirection.IN,
            },
          });
          if (duplicated) {
            this.logger.log(
              `INCOMING_DUPLICATE_RACE trace=${traceId} db_message_id=${duplicated.id}`,
            );
            return duplicated;
          }
        }

        // ER_NO_REFERENCED_ROW_2: stale FK reference — reload fresh chat and retry once
        if (errorCode === 'ER_NO_REFERENCED_ROW_2') {
          this.logger.warn(
            `INCOMING_FK_VIOLATION trace=${traceId} chat_id=${message.chatId} — reloading fresh chat and retrying`,
          );
          const freshChat = await this.chatRepository.findOne({
            where: { chat_id: message.chatId },
            relations: ['poste'],
          });
          if (freshChat) {
            const saved = await this.messageRepository.save(
              buildMessageEntity(freshChat),
            );
            this.logger.log(
              `INCOMING_SAVED_RETRY trace=${traceId} db_message_id=${saved.id}`,
            );
            return saved;
          }
        }

        throw error;
      }
    } catch (error) {
      this.logger.error(
        `INCOMING_SAVE_FAILED trace=${traceId} error=${error.message}`,
        error.stack,
      );
      throw new Error(`Impossible de sauvegarder le message: ${error.message}`);
    }
  }

  async updateStatusFromUnified(status: {
    providerMessageId: string;
    recipientId: string;
    status: string;
    provider?: string;
    errorCode?: number;
    errorTitle?: string;
  }) {
    return this.updateByStatus({
      id: status.providerMessageId,
      recipient_id: status.recipientId,
      status: status.status,
      errorCode: status.errorCode,
      errorTitle: status.errorTitle,
    });
  }
}
