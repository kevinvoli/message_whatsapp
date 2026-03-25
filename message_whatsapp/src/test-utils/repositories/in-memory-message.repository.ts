import {
  MessageDirection,
  WhatsappMessage,
  WhatsappMessageStatus,
} from 'src/whatsapp_message/entities/whatsapp_message.entity';
import {
  IMessageRepository,
  PaginatedResult,
} from 'src/domain/repositories/i-message.repository';

/**
 * Implémentation en mémoire de IMessageRepository.
 * Utilisée dans les tests unitaires — aucune connexion DB requise.
 */
export class InMemoryMessageRepository implements IMessageRepository {
  private readonly store = new Map<string, WhatsappMessage>();
  private idCounter = 1;

  // ── Helpers tests ──────────────────────────────────────────────────────────

  seed(message: Partial<WhatsappMessage>): WhatsappMessage {
    const entity = this.build(message);
    if (!entity.id) (entity as any).id = `msg-${this.idCounter++}`;
    this.store.set(entity.id, entity);
    return entity;
  }

  all(): WhatsappMessage[] {
    return [...this.store.values()];
  }

  clear(): void {
    this.store.clear();
  }

  // ── IMessageRepository ─────────────────────────────────────────────────────

  findById(id: string): Promise<WhatsappMessage | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }

  findByMessageId(messageId: string): Promise<WhatsappMessage | null> {
    const found = [...this.store.values()].find(m => m.message_id === messageId);
    return Promise.resolve(found ?? null);
  }

  findByExternalId(externalId: string): Promise<WhatsappMessage | null> {
    const found = [...this.store.values()].find(m => m.external_id === externalId);
    return Promise.resolve(found ?? null);
  }

  findIncomingByProviderMessageId(
    provider: string,
    providerMessageId: string,
  ): Promise<WhatsappMessage | null> {
    const found = [...this.store.values()].find(
      m =>
        m.provider === provider &&
        m.provider_message_id === providerMessageId &&
        m.direction === MessageDirection.IN,
    );
    return Promise.resolve(found ?? null);
  }

  findByProviderMessageId(providerMessageId: string): Promise<WhatsappMessage | null> {
    const found = [...this.store.values()].find(
      m => m.provider_message_id === providerMessageId,
    );
    return Promise.resolve(found ?? null);
  }

  findLastByChatId(chatId: string): Promise<WhatsappMessage | null> {
    const sorted = [...this.store.values()]
      .filter(m => m.chat_id === chatId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return Promise.resolve(sorted[0] ?? null);
  }

  findLastInboundByChatId(chatId: string): Promise<WhatsappMessage | null> {
    const sorted = [...this.store.values()]
      .filter(m => m.chat_id === chatId && m.direction === MessageDirection.IN)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return Promise.resolve(sorted[0] ?? null);
  }

  findByChatId(chatId: string, limit = 100, offset = 0): Promise<WhatsappMessage[]> {
    const result = [...this.store.values()]
      .filter(m => m.chat_id === chatId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .slice(offset, offset + limit);
    return Promise.resolve(result);
  }

  findAllByChatId(chatId: string): Promise<WhatsappMessage[]> {
    return Promise.resolve([...this.store.values()].filter(m => m.chat_id === chatId));
  }

  findWithMedias(id: string): Promise<WhatsappMessage | null> {
    return this.findById(id);
  }

  findAll(limit = 50, offset = 0, since?: Date): Promise<PaginatedResult<WhatsappMessage>> {
    let msgs = [...this.store.values()];
    if (since) msgs = msgs.filter(m => m.timestamp >= since);
    const total = msgs.length;
    const data = msgs.slice(offset, offset + limit);
    return Promise.resolve({ data, total });
  }

  findForStatusUpdate(providerMessageId: string, chatId?: string): Promise<WhatsappMessage | null> {
    const found = [...this.store.values()].find(m => {
      const matchId =
        m.external_id === providerMessageId || m.provider_message_id === providerMessageId;
      return chatId ? matchId && m.chat_id === chatId : matchId;
    });
    return Promise.resolve(found ?? null);
  }

  findQuotedById(id: string): Promise<WhatsappMessage | null> {
    return this.findById(id);
  }

  countByChatId(chatId: string): Promise<number> {
    return Promise.resolve([...this.store.values()].filter(m => m.chat_id === chatId).length);
  }

  countUnread(chatId: string): Promise<number> {
    const count = [...this.store.values()].filter(
      m =>
        m.chat_id === chatId &&
        !m.from_me &&
        [WhatsappMessageStatus.SENT, WhatsappMessageStatus.DELIVERED].includes(m.status),
    ).length;
    return Promise.resolve(count);
  }

  save(message: WhatsappMessage): Promise<WhatsappMessage> {
    if (!message.id) (message as any).id = `msg-${this.idCounter++}`;
    this.store.set(message.id, message);
    return Promise.resolve(message);
  }

  build(data: Partial<WhatsappMessage>): WhatsappMessage {
    return { ...data } as WhatsappMessage;
  }

  async markIncomingAsRead(chatId: string): Promise<void> {
    for (const [id, msg] of this.store.entries()) {
      if (
        msg.chat_id === chatId &&
        msg.direction === MessageDirection.IN &&
        msg.status !== WhatsappMessageStatus.READ
      ) {
        this.store.set(id, { ...msg, status: WhatsappMessageStatus.READ });
      }
    }
  }
}
