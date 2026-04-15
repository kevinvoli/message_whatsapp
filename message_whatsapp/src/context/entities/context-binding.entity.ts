import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Context } from './context.entity';

/**
 * CTX-A2 — Entité ContextBinding
 *
 * Table de jointure entre un contexte et les références métier qui lui
 * sont attachées (channel_id, poste_id, provider, ou la valeur "global"
 * pour le pool).
 *
 * Priorité de résolution (ordre décroissant) :
 *   1. CHANNEL  — channel_id match exact
 *   2. POSTE    — poste_id match exact
 *   3. PROVIDER — provider match exact
 *   4. POOL     — binding_type = 'POOL' / ref_value = 'global'
 */
@Entity({ name: 'ctx_context_binding', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('UQ_ctx_binding_type_ref', ['bindingType', 'refValue'], { unique: true })
@Index('IDX_ctx_binding_context', ['contextId'])
export class ContextBinding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'context_id', type: 'char', length: 36 })
  contextId: string;

  /**
   * Type de la référence :
   * - CHANNEL  → refValue contient le channel_id
   * - POSTE    → refValue contient le poste_id
   * - PROVIDER → refValue contient le nom du provider (whapi, meta, …)
   * - POOL     → refValue = 'global'
   */
  @Column({
    name: 'binding_type',
    type: 'enum',
    enum: ['CHANNEL', 'POSTE', 'PROVIDER', 'POOL'],
  })
  bindingType: 'CHANNEL' | 'POSTE' | 'PROVIDER' | 'POOL';

  /** Valeur de référence (channel_id, poste_id, provider, ou "global") */
  @Column({ name: 'ref_value', type: 'varchar', length: 191 })
  refValue: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // ─── Relations ────────────────────────────────────────────────────────────
  @ManyToOne(() => Context, (c) => c.bindings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'context_id' })
  context: Context;
}
