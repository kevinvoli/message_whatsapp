import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  SEND_MESSAGE = 'SEND_MESSAGE',
  ASSIGN = 'ASSIGN',
  TRANSFER = 'TRANSFER',
  CLOSE = 'CLOSE',
  REOPEN = 'REOPEN',
  EXPORT = 'EXPORT',
}

/**
 * P5.4 — Piste d'audit immuable.
 * Pas de UpdateDateColumn ni DeleteDateColumn : les entrées ne sont jamais modifiées.
 */
@Entity({ name: 'audit_log' })
@Index('IDX_audit_tenant_time', ['tenant_id', 'createdAt'])
@Index('IDX_audit_actor', ['actor_id', 'createdAt'])
@Index('IDX_audit_entity', ['entity_type', 'entity_id'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: true })
  tenant_id: string | null;

  /** ID de l'utilisateur qui a effectué l'action (admin ou commercial) */
  @Column({ type: 'char', length: 36, nullable: true })
  actor_id: string | null;

  /** Nom affiché de l'acteur (dénormalisé pour résistance aux suppressions) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  actor_name: string | null;

  /** Type d'acteur : 'admin' | 'commercial' | 'system' */
  @Column({ type: 'varchar', length: 20, nullable: true })
  actor_type: string | null;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  /** Type de l'entité concernée, ex: 'WhatsappChat', 'Contact', 'SlaRule' */
  @Column({ type: 'varchar', length: 100, nullable: true })
  entity_type: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  entity_id: string | null;

  /** Diff JSON : { before: {...}, after: {...} } — null pour CREATE/DELETE simples */
  @Column({ type: 'json', nullable: true })
  diff: Record<string, unknown> | null;

  /** Métadonnées contextuelles : IP, user-agent, etc. */
  @Column({ type: 'json', nullable: true })
  meta: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
