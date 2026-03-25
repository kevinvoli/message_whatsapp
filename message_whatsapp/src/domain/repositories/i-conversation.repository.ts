import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

export interface IConversationRepository {
  // ── Reads ──────────────────────────────────────────────────────────────────

  /** Trouve une conversation par chat_id avec ses relations (poste, channel, messages). */
  findByChatId(chatId: string): Promise<WhatsappChat | null>;

  /** Trouve une conversation par chat_id sans charger les relations. */
  findByChatIdShallow(chatId: string): Promise<WhatsappChat | null>;

  /** Toutes les conversations assignées à un poste. */
  findByPosteId(posteId: string): Promise<WhatsappChat[]>;

  /** Conversations dont le statut est dans la liste fournie. */
  findByStatuses(statuses: WhatsappChatStatus[]): Promise<WhatsappChat[]>;

  /**
   * Conversations EN_ATTENTE les plus récentes avec la relation poste chargée.
   * Utilisé pour le snapshot du dispatcher (dashboard admin).
   */
  findRecentWaiting(limit: number): Promise<WhatsappChat[]>;

  /**
   * Conversations dont la first_response_deadline_at est dépassée
   * et le last_poste_message_at est null.
   */
  findExpiredSla(
    statuses: WhatsappChatStatus[],
    before: Date,
  ): Promise<WhatsappChat[]>;

  /**
   * Nombre de postes différents dans la queue excluant le poste fourni.
   * Utilisé pour décider si un redispatch est utile.
   */
  countQueuedPostesExcluding(posteId: string): Promise<number>;

  // ── Writes ─────────────────────────────────────────────────────────────────

  save(conversation: WhatsappChat): Promise<WhatsappChat>;

  /** Mise à jour partielle ciblée par critère. */
  update(
    criteria: { id?: string; chat_id?: string },
    fields: Partial<WhatsappChat>,
  ): Promise<void>;

  /** Crée un objet entité sans persister. */
  build(data: Partial<WhatsappChat>): WhatsappChat;
}
