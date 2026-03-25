import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, IsNull, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import {
  MessageDirection,
  WhatsappMessage,
  WhatsappMessageStatus,
} from 'src/whatsapp_message/entities/whatsapp_message.entity';
import {
  IMessageRepository,
  PaginatedResult,
} from 'src/domain/repositories/i-message.repository';

@Injectable()
export class MessageTypeOrmRepository implements IMessageRepository {
  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly repo: Repository<WhatsappMessage>,
  ) {}

  findById(id: string): Promise<WhatsappMessage | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByMessageId(messageId: string): Promise<WhatsappMessage | null> {
    return this.repo.findOne({ where: { message_id: messageId } });
  }

  findByExternalId(externalId: string): Promise<WhatsappMessage | null> {
    return this.repo.findOne({
      where: { external_id: externalId },
      relations: ['chat'],
    });
  }

  findIncomingByProviderMessageId(
    provider: string,
    providerMessageId: string,
  ): Promise<WhatsappMessage | null> {
    return this.repo.findOne({
      where: {
        provider,
        provider_message_id: providerMessageId,
        direction: MessageDirection.IN,
      },
      relations: ['chat'],
    });
  }

  findByProviderMessageId(
    providerMessageId: string,
  ): Promise<WhatsappMessage | null> {
    return this.repo.findOne({
      where: { provider_message_id: providerMessageId },
    });
  }

  findLastByChatId(chatId: string): Promise<WhatsappMessage | null> {
    return this.repo.findOne({
      where: { chat_id: chatId },
      order: { timestamp: 'DESC' },
      relations: ['medias'],
    });
  }

  findLastInboundByChatId(chatId: string): Promise<WhatsappMessage | null> {
    return this.repo.findOne({
      where: { chat_id: chatId, direction: MessageDirection.IN },
      order: { timestamp: 'DESC' },
    });
  }

  findByChatId(
    chatId: string,
    limit = 100,
    offset = 0,
  ): Promise<WhatsappMessage[]> {
    return this.repo.find({
      where: { chat_id: chatId },
      relations: ['chat', 'poste', 'medias', 'quotedMessage'],
      order: { timestamp: 'ASC', createdAt: 'ASC' },
      take: limit,
      skip: offset,
    });
  }

  findAllByChatId(chatId: string): Promise<WhatsappMessage[]> {
    return this.repo.find({
      where: { chat_id: chatId },
      relations: { medias: true, poste: true, chat: true },
    });
  }

  findWithMedias(id: string): Promise<WhatsappMessage | null> {
    return this.repo.findOne({
      where: { id },
      relations: {
        medias: true,
        chat: true,
        poste: true,
        contact: true,
        quotedMessage: true,
        channel: true,
        commercial: true,
      },
    });
  }

  async findAll(
    limit = 50,
    offset = 0,
    since?: Date,
  ): Promise<PaginatedResult<WhatsappMessage>> {
    const where: FindOptionsWhere<WhatsappMessage> = {};
    if (since) {
      where.timestamp = MoreThanOrEqual(since);
    }
    const [data, total] = await this.repo.findAndCount({
      relations: { poste: true, chat: true, contact: true, commercial: true },
      where,
      order: { timestamp: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data, total };
  }

  async findForStatusUpdate(
    providerMessageId: string,
    chatId?: string,
  ): Promise<WhatsappMessage | null> {
    const conditions: FindOptionsWhere<WhatsappMessage>[] = chatId
      ? [
          { external_id: providerMessageId, chat_id: chatId },
          { provider_message_id: providerMessageId, chat_id: chatId },
        ]
      : [
          { external_id: providerMessageId },
          { provider_message_id: providerMessageId },
        ];
    return this.repo.findOne({ where: conditions });
  }

  findQuotedById(id: string): Promise<WhatsappMessage | null> {
    return this.repo.findOne({ where: { id } });
  }

  countByChatId(chatId: string): Promise<number> {
    return this.repo.count({ where: { chat_id: chatId } });
  }

  countUnread(chatId: string): Promise<number> {
    return this.repo.count({
      where: {
        chat_id: chatId,
        from_me: false,
        status: In([
          WhatsappMessageStatus.SENT,
          WhatsappMessageStatus.DELIVERED,
        ]),
      },
    });
  }

  save(message: WhatsappMessage): Promise<WhatsappMessage> {
    return this.repo.save(message);
  }

  build(data: Partial<WhatsappMessage>): WhatsappMessage {
    return this.repo.create(data);
  }

  async markIncomingAsRead(chatId: string): Promise<void> {
    await this.repo.query(
      `UPDATE whatsapp_message
       SET status    = 'READ',
           updatedAt = updatedAt,
           \`timestamp\` = \`timestamp\`
       WHERE chat_id = ?
         AND direction = 'IN'
         AND status != 'READ'`,
      [chatId],
    );
  }
}
