import {
  WhatsappMessage,
} from 'src/whatsapp_message/entities/whatsapp_message.entity';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export interface IMessageRepository {
  // ── Reads ──────────────────────────────────────────────────────────────────

  /** Trouve un message par son PK UUID interne. */
  findById(id: string): Promise<WhatsappMessage | null>;

  /** Trouve par message_id (id Whapi / provider). */
  findByMessageId(messageId: string): Promise<WhatsappMessage | null>;

  /** Trouve par external_id (Whapi). */
  findByExternalId(externalId: string): Promise<WhatsappMessage | null>;

  /** Trouve un message entrant par provider + providerMessageId. */
  findIncomingByProviderMessageId(
    provider: string,
    providerMessageId: string,
  ): Promise<WhatsappMessage | null>;

  /** Trouve par provider_message_id seul (déduplication unified). */
  findByProviderMessageId(
    providerMessageId: string,
  ): Promise<WhatsappMessage | null>;

  /** Dernier message toutes directions confondues pour une conversation. */
  findLastByChatId(chatId: string): Promise<WhatsappMessage | null>;

  /** Dernier message entrant pour une conversation. */
  findLastInboundByChatId(chatId: string): Promise<WhatsappMessage | null>;

  /** Messages paginés d'une conversation (ordre chronologique). */
  findByChatId(
    chatId: string,
    limit?: number,
    offset?: number,
  ): Promise<WhatsappMessage[]>;

  /** Tous les messages d'une conversation avec relations medias/poste/chat. */
  findAllByChatId(chatId: string): Promise<WhatsappMessage[]>;

  /** Trouve un message avec toutes ses relations chargées. */
  findWithMedias(id: string): Promise<WhatsappMessage | null>;

  /** Liste paginée globale, optionnellement filtrée par date. */
  findAll(
    limit?: number,
    offset?: number,
    since?: Date,
  ): Promise<PaginatedResult<WhatsappMessage>>;

  /**
   * Trouve un message pour mise à jour de statut.
   * Recherche par (external_id OR provider_message_id), filtré par chat_id si fourni.
   */
  findForStatusUpdate(
    providerMessageId: string,
    chatId?: string,
  ): Promise<WhatsappMessage | null>;

  /** Trouve le message quoté (par UUID DB). */
  findQuotedById(id: string): Promise<WhatsappMessage | null>;

  countByChatId(chatId: string): Promise<number>;

  /** Compte les messages non lus (direction IN, statut SENT ou DELIVERED). */
  countUnread(chatId: string): Promise<number>;

  // ── Writes ─────────────────────────────────────────────────────────────────

  save(message: WhatsappMessage): Promise<WhatsappMessage>;

  /** Crée un objet entité sans persister (équivalent TypeORM `create()`). */
  build(data: Partial<WhatsappMessage>): WhatsappMessage;

  /**
   * Marque tous les messages entrants d'une conversation comme lus.
   * Préserve `timestamp` et `updatedAt` pour éviter le ON UPDATE MySQL.
   */
  markIncomingAsRead(chatId: string): Promise<void>;
}
