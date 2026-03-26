import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import {
  MessageDirection,
  WhatsappMessage,
  WhatsappMessageStatus,
} from '../entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhapiMessage } from 'src/whapi/interface/whapi-webhook.interface';
import { UnifiedMessage } from 'src/webhooks/normalization/unified-message';
import { ChannelService } from 'src/channel/channel.service';
import { ContactService } from 'src/contact/contact.service';
import { IMessageRepository } from 'src/domain/repositories/i-message.repository';
import { IConversationRepository } from 'src/domain/repositories/i-conversation.repository';
import { ICommercialRepository } from 'src/domain/repositories/i-commercial.repository';
import {
  MESSAGE_REPOSITORY,
  CONVERSATION_REPOSITORY,
  COMMERCIAL_REPOSITORY,
} from 'src/domain/repositories/repository.tokens';

/**
 * Persistance des messages entrants (Whapi, Meta/unified, interne).
 */
@Injectable()
export class InboundPersistenceService {
  private readonly logger = new Logger(InboundPersistenceService.name);

  constructor(
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly chatRepository: IConversationRepository,
    @Inject(COMMERCIAL_REPOSITORY)
    private readonly commercialRepository: ICommercialRepository,
    private readonly channelService: ChannelService,
    private readonly contactService: ContactService,
  ) {}

  async saveIncomingFromWhapi(
    message: WhapiMessage,
    chat: WhatsappChat,
  ): Promise<WhatsappMessage> {
    const traceId = this.buildTraceId(message.id, message.chat_id);
    try {
      this.logger.log(
        `INCOMING_SAVE_REQUEST trace=${traceId} chat_id=${message.chat_id}`,
      );
      const existingMessage = await this.messageRepository.findByMessageId(
        message.id,
      );
      if (existingMessage) {
        this.logger.log(
          `INCOMING_DUPLICATE trace=${traceId} db_message_id=${existingMessage.id} direction=${existingMessage.direction}`,
        );
        return existingMessage;
      }

      const channel = await this.channelService.findOne(message.channel_id);
      if (!channel) {
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
        const saved = await this.messageRepository.save(
          this.messageRepository.build({
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
          `INCOMING_SAVED trace=${traceId} db_message_id=${saved.id}`,
        );
        return saved;
      } catch (error) {
        if (
          error instanceof QueryFailedError &&
          typeof (error as any).driverError?.code === 'string' &&
          ['ER_DUP_ENTRY', '23505', 'SQLITE_CONSTRAINT'].includes(
            (error as any).driverError.code,
          )
        ) {
          const duplicated = await this.messageRepository.findByMessageId(
            message.id,
          );
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
      this.logger.error(
        `INCOMING_SAVE_FAILED trace=${traceId} error=${error.message}`,
        error.stack,
      );
      throw new Error(`Impossible de sauvegarder le message: ${error.message}`);
    }
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
      const existingMessage = await this.messageRepository.findByProviderMessageId(
        message.providerMessageId,
      );
      if (existingMessage) {
        this.logger.log(
          `INCOMING_DUPLICATE trace=${traceId} db_message_id=${existingMessage.id}`,
        );
        return existingMessage;
      }

      const channel = await this.channelService.findOne(message.channelId);
      if (!channel) {
        throw new Error(`Channel ${message.channelId} non trouve`);
      }

      const contact = await this.contactService.findOrCreate(
        message.from,
        message.chatId,
        message.fromName ?? message.from,
      );

      if (message.direction === 'in') {
        await this.chatRepository.update(
          { id: chat.id },
          {
            last_msg_client_channel_id: channel.channel_id,
            channel_id: channel.channel_id,
          },
        );
        chat.last_msg_client_channel_id = channel.channel_id;
        chat.channel_id = channel.channel_id;
      }

      let quotedMsg: WhatsappMessage | null = null;
      if (message.quotedProviderMessageId) {
        quotedMsg = await this.messageRepository.findByProviderMessageId(
          message.quotedProviderMessageId,
        );
      }

      const buildMessageEntity = (chatRef: WhatsappChat) =>
        this.messageRepository.build({
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

        if (
          errorCode &&
          ['ER_DUP_ENTRY', '23505', 'SQLITE_CONSTRAINT'].includes(errorCode)
        ) {
          const duplicated = await this.messageRepository.findIncomingByProviderMessageId(
            message.provider,
            message.providerMessageId,
          );
          if (duplicated) {
            this.logger.log(
              `INCOMING_DUPLICATE_RACE trace=${traceId} db_message_id=${duplicated.id}`,
            );
            return duplicated;
          }
        }

        if (errorCode === 'ER_NO_REFERENCED_ROW_2') {
          this.logger.warn(
            `INCOMING_FK_VIOLATION trace=${traceId} chat_id=${message.chatId} — reloading fresh chat and retrying`,
          );
          const freshChat = await this.chatRepository.findByChatId(
            message.chatId,
          );
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

  async createInternalMessage(message: any, commercialId?: string) {
    try {
      if (!commercialId) {
        return null;
      }

      const chat = await this.chatRepository.findByChatIdShallow(
        message.chat_id,
      );

      if (!chat) {
        throw new Error('Chat not found or created');
      }

      const chekMessage = await this.messageRepository.findByMessageId(
        message.id,
      );

      if (chekMessage) {
        return chekMessage;
      }

      const commercial = await this.commercialRepository.findById(commercialId);

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

      const messageEntity = this.messageRepository.build(data);
      return this.messageRepository.save(messageEntity);
    } catch (error) {
      this.logger.error(
        'Error creating internal message',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error(`Failed to create message: ${error}`);
    }
  }

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

  private buildTraceId(messageId?: string | null, chatId?: string): string {
    return messageId ?? `chat:${chatId ?? 'unknown'}:${Date.now()}`;
  }
}
