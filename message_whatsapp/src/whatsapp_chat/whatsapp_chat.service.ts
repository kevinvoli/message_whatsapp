/**
 * TICKET-06-B — `WhatsappChatService` délègue toutes les lectures à
 * `ConversationReadQueryService`. Ce service ne conserve que les mutations
 * (create, update, mark-as-read, lock/unlock, etc.).
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat, ConversationResult } from './entities/whatsapp_chat.entity';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import {
  ConversationReadQueryService,
  FindAllResult,
  PosteStats,
  CommercialStats,
} from 'src/conversations/infrastructure/conversation-read-query.service';

// Re-export des interfaces pour les consommateurs existants (rétro-compatibilité)
export type { PosteStats, CommercialStats };

@Injectable()
export class WhatsappChatService {
  private readonly logger = new Logger(WhatsappChatService.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    private readonly posteService: WhatsappPosteService,
    private readonly readQuery: ConversationReadQueryService,
  ) {}

  // ── Délégation aux lectures : ConversationReadQueryService ──────────────────

  /** @see ConversationReadQueryService.findByPosteId */
  async findByPosteId(
    poste_id: string,
    excludeStatuses: string[] = ['fermé', 'converti'],
    limit = 300,
    cursor?: { activityAt: string; chatId: string },
  ): Promise<{ chats: WhatsappChat[]; hasMore: boolean }> {
    return this.readQuery.findByPosteId(poste_id, excludeStatuses, limit, cursor);
  }

  /** @see ConversationReadQueryService.getTotalUnreadForPoste */
  async getTotalUnreadForPoste(poste_id: string): Promise<number> {
    return this.readQuery.getTotalUnreadForPoste(poste_id);
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
    return this.chatRepository.save(chat);
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
}
