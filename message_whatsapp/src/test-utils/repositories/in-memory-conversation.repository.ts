import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { IConversationRepository } from 'src/domain/repositories/i-conversation.repository';

/**
 * Implémentation en mémoire de IConversationRepository.
 * Utilisée dans les tests unitaires — aucune connexion DB requise.
 */
export class InMemoryConversationRepository implements IConversationRepository {
  private readonly store = new Map<string, WhatsappChat>();
  private idCounter = 1;

  // ── Helpers tests ──────────────────────────────────────────────────────────

  seed(chat: Partial<WhatsappChat>): WhatsappChat {
    const entity = this.build(chat);
    if (!entity.id) (entity as any).id = `chat-id-${this.idCounter++}`;
    this.store.set(entity.chat_id, entity);
    return entity;
  }

  all(): WhatsappChat[] {
    return [...this.store.values()];
  }

  clear(): void {
    this.store.clear();
  }

  // ── IConversationRepository ────────────────────────────────────────────────

  findByChatId(chatId: string): Promise<WhatsappChat | null> {
    const found = [...this.store.values()].find(c => c.chat_id === chatId);
    return Promise.resolve(found ?? null);
  }

  findByChatIdShallow(chatId: string): Promise<WhatsappChat | null> {
    return this.findByChatId(chatId);
  }

  findByPosteId(posteId: string): Promise<WhatsappChat[]> {
    return Promise.resolve([...this.store.values()].filter(c => c.poste_id === posteId));
  }

  findByStatuses(statuses: WhatsappChatStatus[]): Promise<WhatsappChat[]> {
    return Promise.resolve([...this.store.values()].filter(c => statuses.includes(c.status)));
  }

  findRecentWaiting(limit: number): Promise<WhatsappChat[]> {
    const result = [...this.store.values()]
      .filter(c => c.status === WhatsappChatStatus.EN_ATTENTE)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
    return Promise.resolve(result);
  }

  findExpiredSla(statuses: WhatsappChatStatus[], before: Date): Promise<WhatsappChat[]> {
    const result = [...this.store.values()].filter(
      c =>
        statuses.includes(c.status) &&
        !c.last_poste_message_at &&
        c.first_response_deadline_at != null &&
        c.first_response_deadline_at < before,
    );
    return Promise.resolve(result);
  }

  countQueuedPostesExcluding(posteId: string): Promise<number> {
    const postes = new Set(
      [...this.store.values()]
        .filter(c => c.poste_id && c.poste_id !== posteId)
        .map(c => c.poste_id),
    );
    return Promise.resolve(postes.size);
  }

  save(conversation: WhatsappChat): Promise<WhatsappChat> {
    if (!conversation.id) (conversation as any).id = `chat-id-${this.idCounter++}`;
    this.store.set(conversation.chat_id, conversation);
    return Promise.resolve(conversation);
  }

  async update(
    criteria: { id?: string; chat_id?: string },
    fields: Partial<WhatsappChat>,
  ): Promise<void> {
    for (const [key, chat] of this.store.entries()) {
      const matchId = criteria.id ? chat.id === criteria.id : true;
      const matchChatId = criteria.chat_id ? chat.chat_id === criteria.chat_id : true;
      if (matchId && matchChatId) {
        this.store.set(key, { ...chat, ...fields });
      }
    }
  }

  build(data: Partial<WhatsappChat>): WhatsappChat {
    return { ...data } as WhatsappChat;
  }
}
