import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContextBinding } from './context-binding.entity';
import { ChatContext } from './chat-context.entity';

/**
 * CTX-A1 — Entité Context
 *
 * Un "contexte" est une unité logique d'isolation qui regroupe
 * les conversations d'un canal ou d'un poste ou d'un pool.
 * Chaque contexte possède ses propres compteurs (unread, last_activity, etc.)
 * isolés des autres contextes.
 */
@Entity({ name: 'ctx_context', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('IDX_ctx_context_tenant', ['tenantId'])
export class Context {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36, nullable: true })
  tenantId?: string | null;

  /** Libellé humain (ex: "Canal WhatsApp Principal", "Poste Alice") */
  @Column({ name: 'label', type: 'varchar', length: 255, nullable: true })
  label?: string | null;

  /**
   * Type du contexte :
   * - CHANNEL  → isolé par canal (channel_id)
   * - POSTE    → isolé par poste (poste_id)
   * - PROVIDER → partagé par tous les canaux d'un fournisseur (provider)
   * - POOL     → pool global partagé (fallback de dernier recours)
   */
  @Column({
    name: 'context_type',
    type: 'enum',
    enum: ['CHANNEL', 'POSTE', 'PROVIDER', 'POOL'],
  })
  contextType: 'CHANNEL' | 'POSTE' | 'PROVIDER' | 'POOL';

  /** Actif / inactif (pour désactiver sans supprimer) */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // ─── Relations ────────────────────────────────────────────────────────────
  @OneToMany(() => ContextBinding, (b) => b.context)
  bindings: ContextBinding[];

  @OneToMany(() => ChatContext, (cc) => cc.context)
  chatContexts: ChatContext[];
}
