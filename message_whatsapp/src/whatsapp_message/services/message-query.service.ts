import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { WhatsappMessage } from '../entities/whatsapp_message.entity';
import { IMessageRepository } from 'src/domain/repositories/i-message.repository';
import { MESSAGE_REPOSITORY } from 'src/domain/repositories/repository.tokens';

/**
 * Requêtes en lecture seule sur les messages.
 * Aucun effet de bord — peut être injecté partout sans risque.
 */
@Injectable()
export class MessageQueryService {
  constructor(
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
  ) {}

  async findLastMessageBychat_id(
    chat_id: string,
  ): Promise<WhatsappMessage | null> {
    try {
      return await this.messageRepository.findLastByChatId(chat_id);
    } catch (error) {
      throw new NotFoundException(new Error(error));
    }
  }

  findLastInboundMessageBychat_id(
    chat_id: string,
  ): Promise<WhatsappMessage | null> {
    return this.messageRepository.findLastInboundByChatId(chat_id);
  }

  findByExternalId(externalId: string): Promise<WhatsappMessage | null> {
    return this.messageRepository.findByExternalId(externalId);
  }

  findIncomingByProviderMessageId(
    provider: 'whapi' | 'meta',
    providerMessageId: string,
  ): Promise<WhatsappMessage | null> {
    return this.messageRepository.findIncomingByProviderMessageId(
      provider,
      providerMessageId,
    );
  }

  async findBychat_id(
    chat_id: string,
    limit = 100,
    offset = 0,
  ): Promise<WhatsappMessage[]> {
    try {
      return await this.messageRepository.findByChatId(chat_id, limit, offset);
    } catch (error) {
      throw new NotFoundException(error.message ?? error);
    }
  }

  findAllByChatId(chat_id: string): Promise<WhatsappMessage[]> {
    return this.messageRepository.findAllByChatId(chat_id);
  }

  async findAll(
    limit = 50,
    offset = 0,
    dateStart?: Date,
  ): Promise<{ data: unknown[]; total: number }> {
    return this.messageRepository.findAll(limit, offset, dateStart);
  }

  async findByAllByMessageId(id: string): Promise<void> {
    try {
      const message = await this.messageRepository.findById(id);
      if (message) {
        throw new NotFoundException('message non trouver');
      }
    } catch (err) {
      throw new Error(err);
    }
  }

  findOneWithMedias(id: string): Promise<WhatsappMessage | null> {
    return this.messageRepository.findWithMedias(id);
  }

  countBychat_id(chat_id: string): Promise<number> {
    return this.messageRepository.countByChatId(chat_id);
  }

  async countUnreadMessages(chat_id: string): Promise<number> {
    try {
      return await this.messageRepository.countUnread(chat_id);
    } catch (error) {
      throw new NotFoundException(new Error(error));
    }
  }
}
