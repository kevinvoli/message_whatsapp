import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { IConversationRepository } from 'src/domain/repositories/i-conversation.repository';

@Injectable()
export class ConversationTypeOrmRepository implements IConversationRepository {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly repo: Repository<WhatsappChat>,
  ) {}

  findByChatId(chatId: string): Promise<WhatsappChat | null> {
    return this.repo.findOne({
      where: { chat_id: chatId },
      relations: ['messages', 'poste', 'channel'],
    });
  }

  findByChatIdShallow(chatId: string): Promise<WhatsappChat | null> {
    return this.repo.findOne({ where: { chat_id: chatId } });
  }

  findByPosteId(posteId: string): Promise<WhatsappChat[]> {
    return this.repo.find({ where: { poste_id: posteId } });
  }

  findByStatuses(statuses: WhatsappChatStatus[]): Promise<WhatsappChat[]> {
    return this.repo.find({ where: { status: In(statuses) } });
  }

  findRecentWaiting(limit: number): Promise<WhatsappChat[]> {
    return this.repo.find({
      where: { status: WhatsappChatStatus.EN_ATTENTE },
      relations: ['poste'],
      order: { updatedAt: 'DESC' },
      take: limit,
    });
  }

  findExpiredSla(
    statuses: WhatsappChatStatus[],
    before: Date,
  ): Promise<WhatsappChat[]> {
    return this.repo.find({
      where: {
        status: In(statuses),
        last_poste_message_at: IsNull(),
        first_response_deadline_at: LessThan(before),
      },
    });
  }

  async countQueuedPostesExcluding(posteId: string): Promise<number> {
    const rows = await this.repo
      .createQueryBuilder('chat')
      .select('COUNT(DISTINCT chat.poste_id)', 'cnt')
      .where('chat.poste_id IS NOT NULL')
      .andWhere('chat.poste_id != :posteId', { posteId })
      .getRawOne<{ cnt: string }>();
    return Number(rows?.cnt ?? 0);
  }

  save(conversation: WhatsappChat): Promise<WhatsappChat> {
    return this.repo.save(conversation);
  }

  async update(
    criteria: { id?: number; chat_id?: string },
    fields: Partial<WhatsappChat>,
  ): Promise<void> {
    await this.repo.update(criteria, fields);
  }

  build(data: Partial<WhatsappChat>): WhatsappChat {
    return this.repo.create(data);
  }
}
