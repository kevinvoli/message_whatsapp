/**
 * TICKET-06-B — `WhatsappChatService` délègue toutes les lectures à
 * `ConversationReadQueryService`. Ce service ne conserve que les mutations
 * (create, update, mark-as-read, lock/unlock, etc.).
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { WhatsappChat } from './entities/whatsapp_chat.entity';
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

  /**
   * Libère les conversations verrouillées (read_only=true) sans qu'aucun auto-message
   * n'ait encore été envoyé. Ce cas survient quand le serveur redémarre après que
   * l'orchestrateur a posé le verrou DB mais avant d'avoir envoyé le message.
   */
  async resetStaleAutoMessageLocks(): Promise<number> {
    const result = await this.chatRepository.update(
      {
        read_only: true,
        last_auto_message_sent_at: IsNull(),
      },
      { read_only: false },
    );
    return result.affected ?? 0;
  }

  async update(chat_id: string, data: Partial<WhatsappChat>): Promise<void> {
    // ─── Réinitialisations automatiques des cycles auto-message ──────────────

    // Trigger A : agent répond → cycle no_response repart de zéro
    if (data.last_poste_message_at !== undefined) {
      data.no_response_auto_step = 0;
      data.last_no_response_auto_sent_at = null;
    }

    // Trigger E : conversation assignée → cycle queue_wait repart de zéro
    if (data.poste_id !== undefined && data.poste_id !== null) {
      data.queue_wait_auto_step = 0;
      data.last_queue_wait_auto_sent_at = null;
      data.on_assign_auto_sent = false; // réarmer trigger I si ré-assignation
    }

    // Trigger H : toute activité → cycle inactivity repart de zéro
    if (data.last_activity_at !== undefined) {
      data.inactivity_auto_step = 0;
      data.last_inactivity_auto_sent_at = null;
    }

    await this.chatRepository.update({ chat_id }, data);
  }

  /**
   * Marque une conversation comme réouverte (trigger D).
   * À appeler depuis le handler de message entrant quand status était 'fermé'.
   */
  async markReopened(chat_id: string): Promise<void> {
    await this.chatRepository.update({ chat_id }, {
      reopened_at: new Date(),
      reopened_auto_sent: false,
      out_of_hours_auto_sent: false,
    });
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
}
