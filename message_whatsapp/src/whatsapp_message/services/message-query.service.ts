import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, MoreThanOrEqual, Repository } from 'typeorm';
import {
  MessageDirection,
  WhatsappMessage,
  WhatsappMessageStatus,
} from '../entities/whatsapp_message.entity';

/**
 * Requêtes en lecture seule sur les messages.
 * Aucun effet de bord — peut être injecté partout sans risque.
 */
@Injectable()
export class MessageQueryService {
  private readonly logger = new Logger(MessageQueryService.name);

  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
  ) {}

  async findLastMessageBychat_id(chat_id: string): Promise<WhatsappMessage | null> {
    try {
      return await this.messageRepository.findOne({
        where: { chat_id },
        order: { timestamp: 'DESC' },
        relations: ['medias'],
      });
    } catch (error) {
      throw new NotFoundException(new Error(error));
    }
  }

  async findLastInboundMessageBychat_id(chat_id: string): Promise<WhatsappMessage | null> {
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
    provider: 'whapi' | 'meta',
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
    limit = 100,
    offset = 0,
  ): Promise<WhatsappMessage[]> {
    try {
      return await this.messageRepository.find({
        where: { chat_id },
        relations: ['chat', 'poste', 'medias', 'quotedMessage'],
        order: { timestamp: 'ASC', createdAt: 'ASC' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new NotFoundException(error.message ?? error);
    }
  }

  async findAllByChatId(chat_id: string): Promise<WhatsappMessage[]> {
    return this.messageRepository.find({
      where: { chat_id },
      relations: { medias: true, poste: true, chat: true },
    });
  }

  async findAll(
    limit = 50,
    offset = 0,
    dateStart?: Date,
  ): Promise<{ data: unknown[]; total: number }> {
    const where: FindOptionsWhere<WhatsappMessage> = {};
    if (dateStart) {
      where.timestamp = MoreThanOrEqual(dateStart);
    }
    const [messages, total] = await this.messageRepository.findAndCount({
      relations: { poste: true, chat: true, contact: true, commercial: true },
      where,
      order: { timestamp: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data: messages, total };
  }

  async findByAllByMessageId(id: string): Promise<void> {
    try {
      const message = await this.messageRepository.findOne({ where: { id } });
      if (message) {
        throw new NotFoundException('message non trouver');
      }
    } catch (err) {
      throw new Error(err);
    }
  }

  async findOneWithMedias(id: string): Promise<WhatsappMessage | null> {
    return this.messageRepository.findOne({
      where: { id },
      relations: {
        medias: true,
        chat: true,
        poste: true,
        contact: true,
        quotedMessage: true,
      },
    });
  }

  async countBychat_id(chat_id: string): Promise<number> {
    return this.messageRepository.count({ where: { chat_id } });
  }

  async countUnreadMessages(chat_id: string): Promise<number> {
    try {
      return await this.messageRepository.count({
        where: {
          chat_id,
          from_me: false,
          status: In([
            WhatsappMessageStatus.SENT,
            WhatsappMessageStatus.DELIVERED,
          ]),
        },
      });
    } catch (error) {
      throw new NotFoundException(new Error(error));
    }
  }
}
