/**
 * TICKET-06-B — `WhatsappChatService` délègue toutes les lectures à
 * `ConversationReadQueryService`. Ce service ne conserve que les mutations
 * (create, update, mark-as-read, lock/unlock, etc.).
 */
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat, WhatsappChatStatus, ConversationResult } from './entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import {
  ConversationReadQueryService,
  FindAllResult,
  PosteStats,
  CommercialStats,
} from 'src/conversations/infrastructure/conversation-read-query.service';
import { ConversationCapacityService } from 'src/conversation-capacity/conversation-capacity.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Re-export des interfaces pour les consommateurs existants (rétro-compatibilité)
export type { PosteStats, CommercialStats };

@Injectable()
export class WhatsappChatService {
  private readonly logger = new Logger(WhatsappChatService.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
    private readonly posteService: WhatsappPosteService,
    private readonly readQuery: ConversationReadQueryService,

    @Optional()
    private readonly capacityService: ConversationCapacityService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Délégation aux lectures : ConversationReadQueryService ──────────────────

  /** @see ConversationReadQueryService.findByPosteId */
  async findByPosteId(
    poste_id: string,
    excludeStatuses: string[] = ['fermé', 'converti'],
    limit = 300,
    cursor?: { activityAt: string; chatId: string },
    excludeWindowStatus?: string,
    onlySlotted = false,
  ): Promise<{ chats: WhatsappChat[]; hasMore: boolean }> {
    return this.readQuery.findByPosteId(poste_id, excludeStatuses, limit, cursor, excludeWindowStatus, onlySlotted);
  }

  /** @see ConversationReadQueryService.getTotalUnreadForPoste */
  async getTotalUnreadForPoste(poste_id: string): Promise<number> {
    return this.readQuery.getTotalUnreadForPoste(poste_id);
  }

  /**
   * Trouve ou crée une conversation pour un envoi sortant (outbound-init).
   * Aucun poste n'est assigné — la conversation attend le dispatch.
   */
  async findOrCreateChatForOutbound(
    phone: string,
    channelId: string,
  ): Promise<WhatsappChat> {
    const chat_id = `${phone}@s.whatsapp.net`;
    const existing = await this.chatRepository.findOne({
      where: { chat_id },
      relations: ['poste', 'channel'],
    });
    if (existing) {
      return existing;
    }

    const newChat = this.chatRepository.create({
      chat_id,
      name: phone,
      type: 'private',
      chat_pic: '',
      chat_pic_full: '',
      is_pinned: false,
      is_muted: false,
      mute_until: null,
      is_archived: false,
      unread_count: 0,
      unread_mention: false,
      read_only: false,
      not_spam: true,
      contact_client: phone,
      channel_id: channelId,
      last_activity_at: new Date(),
    });

    return this.chatRepository.save(newChat);
  }

  async findOrCreateChat(
    chat_id: string,
    from: string,
    fromName: string,
    posteId: string,
  ): Promise<WhatsappChat> {
    try {
      const existingChat = await this.chatRepository.findOne({
        where: { chat_id: chat_id },
        relations: ['poste', 'channel'],
      });

      if (existingChat) {
        return existingChat;
      }

      const poste = await this.posteService.findOneById(posteId);
      if (!poste) {
        throw new Error('Commercial not found');
      }

      const newChat = this.chatRepository.create({
        chat_id: chat_id,
        name: fromName,
        type: 'private',
        chat_pic: '',
        chat_pic_full: '',
        is_pinned: false,
        is_muted: false,
        mute_until: null,
        is_archived: false,
        unread_count: 0,
        unread_mention: false,
        read_only: false,
        not_spam: true,
        poste: poste,

        contact_client: from,
        last_activity_at: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return this.chatRepository.save(newChat);
    } catch (error) {
      this.logger.error(
        'Error finding or creating chat',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error(`Failed to find or create chat: ${String(error)}`);
    }
  }

  /* =======================
   * 👁️ CHAT OUVERT (READ ALL)
   * ======================= */
  async markChatAsRead(chat_id: string): Promise<void> {
    // Ancrage explicite de updatedAt pour bloquer ON UPDATE CURRENT_TIMESTAMP côté MySQL.
    await this.chatRepository.query(
      `UPDATE whatsapp_chat SET unread_count = 0, updatedAt = updatedAt WHERE chat_id = ?`,
      [chat_id],
    );

    this.logger.debug(`Chat marked as read (${chat_id})`);
  }

  /* =======================
   * ➕ MESSAGE ENTRANT
   * ======================= */
  async incrementUnreadCount(chat_id: string): Promise<void> {
    // Fusion des 2 UPDATE en 1 seul aller-retour DB
    await this.chatRepository.query(
      `UPDATE whatsapp_chat
       SET unread_count    = unread_count + 1,
           last_activity_at = NOW(),
           updatedAt        = updatedAt
       WHERE chat_id = ?`,
      [chat_id],
    );
  }

  /* =======================
   * 🔄 RECALCUL (SÉCURITÉ)
   * ======================= */
  async recomputeUnreadCount(chat_id: string): Promise<void> {
    await this.chatRepository.query(
      `
      UPDATE whatsapp_chat c
      SET unread_count = (
        SELECT COUNT(*)
        FROM whatsapp_message m
        WHERE m.chat_id = c.chat_id
          AND m.direction = 'IN'
          AND m.status != 'READ'
      )
      WHERE c.chat_id = $1
    `,
      [chat_id],
    );
  }

  /** @see ConversationReadQueryService.findAll */
  async findAll(
    chat_id?: string,
    limit = 50,
    offset = 0,
    dateStart?: Date,
    posteId?: string,
    commercialId?: string,
  ): Promise<FindAllResult> {
    return this.readQuery.findAll(chat_id, limit, offset, dateStart, posteId, commercialId);
  }

  /** @see ConversationReadQueryService.findByChatId */
  async findBychat_id(chat_id: string): Promise<WhatsappChat | null> {
    return this.readQuery.findByChatId(chat_id);
  }

  /** @see ConversationReadQueryService.findBulkByChatIds */
  async findBulkByChatIds(chatIds: string[]): Promise<Map<string, WhatsappChat>> {
    return this.readQuery.findBulkByChatIds(chatIds);
  }

  /** @see ConversationReadQueryService.findOneById */
  async findOne(id: string): Promise<WhatsappChat | null> {
    return this.readQuery.findOneById(id);
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappChat`;
  }

  async update(chat_id: string, data: Partial<WhatsappChat>): Promise<void> {
    await this.chatRepository.update({ chat_id }, data);
    // Émettre l'événement de changement de statut si applicable
    if (data.status !== undefined) {
      this.eventEmitter.emit('conversation.status_changed', {
        chatId: chat_id,
        newStatus: data.status,
        oldStatus: null,
      });
    }
  }

  /** Marque une conversation comme réouverte (utilisé par FlowBot isReopened). */
  async markReopened(chat_id: string): Promise<void> {
    await this.chatRepository.update({ chat_id }, { reopened_at: new Date() });
  }

  async lockConversation(id: string) {
    await this.update(id, { read_only: true });
  }

  async unlockConversation(id: string) {
    await this.update(id, { read_only: false });
  }

  /** @see ConversationReadQueryService.getStatsByPoste */
  async getStatsByPoste(): Promise<PosteStats[]> {
    return this.readQuery.getStatsByPoste();
  }

  /** @see ConversationReadQueryService.getStatsByCommercial */
  async getStatsByCommercial(): Promise<CommercialStats[]> {
    return this.readQuery.getStatsByCommercial();
  }

  // ─── P7 — Statut métier de fin de conversation ──────────────────────────────

  /**
   * Enregistre le résultat métier d'une conversation.
   * Utilise l'UUID interne (id) de la conversation, pas le chat_id Whapi.
   */
  async setConversationResult(
    id: string,
    result: ConversationResult,
    commercial_id: string,
  ): Promise<WhatsappChat> {
    const chat = await this.chatRepository.findOne({ where: { id } });
    if (!chat) throw new NotFoundException(`Conversation ${id} introuvable`);

    chat.conversation_result = result;
    chat.conversation_result_at = new Date();
    chat.conversation_result_by = commercial_id;
    const saved = await this.chatRepository.save(chat);

    this.eventEmitter.emit('conversation.result_set', {
      chatId: saved.chat_id,
      posteId: saved.poste_id,
      result,
    });

    this.eventEmitter.emit('conversation.status_changed', {
      chatId: saved.chat_id,
      oldStatus: saved.status,
      newStatus: saved.status,
      result: result,
    });

    return saved;
  }

  /** Statistiques par résultat métier (admin) */
  async getOutcomeStats(dateStart?: Date, poste_id?: string): Promise<{ result: string; count: number }[]> {
    const qb = this.chatRepository
      .createQueryBuilder('c')
      .select('c.conversation_result', 'result')
      .addSelect('COUNT(*)', 'count')
      .where('c.conversation_result IS NOT NULL')
      .andWhere('c.deletedAt IS NULL')
      .groupBy('c.conversation_result');

    if (dateStart) qb.andWhere('c.createdAt >= :dateStart', { dateStart });
    if (poste_id) qb.andWhere('c.poste_id = :poste_id', { poste_id });

    const rows = await qb.getRawMany<{ result: string; count: string }>();
    return rows.map((r) => ({ result: r.result, count: Number(r.count) }));
  }

  async findUnansweredByCommercial(
    userId: string,
    limit = 20,
  ): Promise<Array<{ chat_id: string; contact_client: string; unread_count: number; last_activity_at: Date }>> {
    const commercial = await this.commercialRepo.findOne({
      where: { id: userId },
      relations: ['poste'],
    });
    if (!commercial?.poste?.id) return [];

    // Priorité = conversations dont le rapport a été soumis aujourd'hui
    // ET où le client a réécrit après (unread_count > 0).
    // On joint conversation_report pour filtrer sur submitted_at >= début du jour.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const chats = await this.chatRepository
      .createQueryBuilder('chat')
      .innerJoin(
        'conversation_report',
        'report',
        'report.chat_id = chat.chat_id AND report.is_submitted = 1 AND report.submitted_at >= :today',
        { today },
      )
      .where('chat.poste_id = :posteId', { posteId: commercial.poste.id })
      .andWhere('chat.unread_count > :zero', { zero: 0 })
      .orderBy('chat.unread_count', 'DESC')
      .addOrderBy('chat.last_activity_at', 'DESC')
      .take(limit)
      .select([
        'chat.chat_id',
        'chat.contact_client',
        'chat.unread_count',
        'chat.last_activity_at',
      ])
      .getMany();

    return chats.map((c) => ({
      chat_id:          c.chat_id,
      contact_client:   c.contact_client,
      unread_count:     c.unread_count,
      last_activity_at: c.last_activity_at,
    }));
  }
}
