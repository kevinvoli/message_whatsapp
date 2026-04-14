import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
    if (!options.olderThan) {
      return this.chatRepository.find({
        where: { status: In(statuses) },
        relations: options.withPoste ? ['poste'] : [],
        take: options.limit,
      });
    }

    // AM#1 fix — Cibler aussi les conversations lues (unread_count = 0) où
    // le commercial a lu le message sans répondre :
    //   last_client_message_at < seuil
    //   ET (unread_count > 0 OU dernier msg poste antérieur au dernier msg client OU jamais répondu)
    //
    // AM#3 fix — Exclure les conversations orphelines (poste_id IS NULL) du chemin SLA :
    // ces conversations sont traitées exclusivement par orphan-checker.
    // Sans cette condition, sla-checker ET orphan-checker peuvent co-assigner la même conversation.
    const qb = this.chatRepository
      .createQueryBuilder('chat')
      .where('chat.status IN (:...statuses)', { statuses })
      .andWhere('chat.last_client_message_at < :threshold', { threshold: options.olderThan })
      .andWhere('chat.poste_id IS NOT NULL')
      .andWhere(
        '(chat.unread_count > 0 OR chat.last_poste_message_at IS NULL OR chat.last_client_message_at > chat.last_poste_message_at)',
      )
      .orderBy('chat.last_client_message_at', 'ASC');

    if (options.withPoste) {
      qb.leftJoinAndSelect('chat.poste', 'poste');
    }
    if (options.limit) {
      qb.take(options.limit);
    }

    return qb.getMany();
  }

  findActiveChatsByPoste(posteId: string): Promise<WhatsappChat[]> {
    // AM#1 fix — Inclure les conversations où le commercial a lu sans répondre
    return this.chatRepository
      .createQueryBuilder('chat')
      .where('chat.poste_id = :posteId', { posteId })
      .andWhere('chat.status IN (:...statuses)', {
        statuses: [WhatsappChatStatus.EN_ATTENTE, WhatsappChatStatus.ACTIF],
      })
      .andWhere(
        '(chat.unread_count > 0 OR chat.last_poste_message_at IS NULL OR chat.last_client_message_at > chat.last_poste_message_at)',
      )
      .getMany();
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
