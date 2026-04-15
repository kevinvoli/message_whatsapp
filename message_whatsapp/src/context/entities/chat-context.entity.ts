import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Context } from './context.entity';

/**
 * CTX-A3 — Entité ChatContext
 *
 * Compteurs par (chat_id × context_id).
 * Remplace la lecture directe de WhatsappChat pour les champs volatiles
 * (unread_count, read_only, last_client_message_at, last_poste_message_at)
 * qui étaient corrompus car partagés entre tous les canaux d'un même chat_id.
 *
 * Invariant fondamental :
 *   Un (chat_id, context_id) est UNIQUE → un contact n'a qu'un seul état
 *   par contexte, quelle que soit la conversation WhatsappChat associée.
 */
@Entity({ name: 'ctx_chat_context', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('UQ_ctx_chat_context', ['chatId', 'contextId'], { unique: true })
@Index('IDX_ctx_chat_context_context', ['contextId'])
@Index('IDX_ctx_chat_context_poste', ['posteId', 'lastActivityAt'])
export class ChatContext {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** chat_id WHAPI (ex: "33612345678@s.whatsapp.net") */
  @Column({ name: 'chat_id', type: 'varchar', length: 100 })
  chatId: string;

  @Column({ name: 'context_id', type: 'char', length: 36 })
  contextId: string;

  // ─── Champs isolés (dupliqués du WhatsappChat mais par contexte) ──────────

  @Column({ name: 'poste_id', type: 'varchar', length: 100, nullable: true })
  posteId?: string | null;

  @Column({ name: 'unread_count', type: 'int', default: 0 })
  unreadCount: number;

  @Column({ name: 'read_only', type: 'boolean', default: false })
  readOnly: boolean;

  @Column({ name: 'last_client_message_at', type: 'timestamp', nullable: true })
  lastClientMessageAt: Date | null;

  @Column({ name: 'last_poste_message_at', type: 'timestamp', nullable: true })
  lastPosteMessageAt: Date | null;

  @Column({ name: 'last_activity_at', type: 'timestamp', nullable: true })
  lastActivityAt: Date | null;

  /** ID de la conversation WhatsappChat la plus récente dans ce contexte */
  @Column({ name: 'whatsapp_chat_id', type: 'char', length: 36, nullable: true })
  whatsappChatId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // ─── Relations ────────────────────────────────────────────────────────────
  @ManyToOne(() => Context, (c) => c.chatContexts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'context_id' })
  context: Context;
}
