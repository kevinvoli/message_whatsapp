import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';

@Injectable()
export class DispatchQueryService {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,

    @InjectRepository(WhatsappPoste)
    private readonly posteRepository: Repository<WhatsappPoste>,
  ) {}

  // ─── Lectures ─────────────────────────────────────────────────────────────

  findChatByChatId(chatId: string): Promise<WhatsappChat | null> {
    return this.chatRepository.findOne({
      where: { chat_id: chatId },
      relations: ['messages', 'poste', 'channel'],
    });
  }

  findChatsByStatus(
    statuses: WhatsappChatStatus[],
    options: { withPoste?: boolean; limit?: number; olderThan?: Date } = {},
  ): Promise<WhatsappChat[]> {
    const where: Record<string, unknown> = { status: In(statuses) };
    if (options.olderThan) {
      where['last_client_message_at'] = LessThan(options.olderThan);
      where['unread_count'] = MoreThan(0);
    }
    return this.chatRepository.find({
      where,
      relations: options.withPoste ? ['poste'] : [],
      order: options.olderThan ? { last_client_message_at: 'ASC' } : undefined,
      take: options.limit,
    });
  }

  findActiveChatsByPoste(posteId: string): Promise<WhatsappChat[]> {
    return this.chatRepository.find({
      where: {
        poste_id: posteId,
        status: In([WhatsappChatStatus.EN_ATTENTE, WhatsappChatStatus.ACTIF]),
        unread_count: MoreThan(0),
      },
    });
  }

  /** Toutes les conversations EN_ATTENTE avec leur poste chargé. */
  findWaitingChatsWithPoste(): Promise<WhatsappChat[]> {
    return this.chatRepository.find({
      where: { status: WhatsappChatStatus.EN_ATTENTE },
      relations: ['poste'],
    });
  }

  /** Toutes les conversations ACTIF non read_only avec leur poste chargé. */
  findActiveChatsWithPoste(): Promise<WhatsappChat[]> {
    return this.chatRepository.find({
      where: { status: WhatsappChatStatus.ACTIF, read_only: false },
      relations: ['poste'],
    });
  }

  findPosteById(posteId: string): Promise<WhatsappPoste | null> {
    return this.posteRepository.findOne({ where: { id: posteId } });
  }

  // ─── Écritures ────────────────────────────────────────────────────────────

  saveChat(chat: WhatsappChat): Promise<WhatsappChat> {
    return this.chatRepository.save(chat);
  }

  createChat(data: Partial<WhatsappChat>): WhatsappChat {
    return this.chatRepository.create(data);
  }

  updateChat(id: string, partial: Partial<WhatsappChat>): Promise<unknown> {
    return this.chatRepository.update(id, partial);
  }
}
