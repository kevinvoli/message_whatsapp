import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Permissions granulaires disponibles dans le système.
 * Convention : RESOURCE:ACTION
 */
export enum Permission {
  // Conversations
  CHAT_VIEW       = 'chat:view',
  CHAT_REPLY      = 'chat:reply',
  CHAT_CLOSE      = 'chat:close',
  CHAT_TRANSFER   = 'chat:transfer',
  CHAT_MERGE      = 'chat:merge',

  // Contacts
  CONTACT_VIEW    = 'contact:view',
  CONTACT_EDIT    = 'contact:edit',
  CONTACT_DELETE  = 'contact:delete',
  CONTACT_EXPORT  = 'contact:export',

  // CRM
  CRM_VIEW        = 'crm:view',
  CRM_EDIT        = 'crm:edit',

  // Labels
  LABEL_VIEW      = 'label:view',
  LABEL_MANAGE    = 'label:manage',

  // Analytics
  ANALYTICS_VIEW  = 'analytics:view',
  ANALYTICS_EXPORT = 'analytics:export',

  // Réponses prédéfinies
  CANNED_VIEW     = 'canned:view',
  CANNED_MANAGE   = 'canned:manage',

  // Admin uniquement
  ADMIN_PANEL     = 'admin:panel',
  USER_MANAGE     = 'user:manage',
  CHANNEL_MANAGE  = 'channel:manage',
}

/**
 * P5.5 — Rôle configurable par tenant.
 * Un rôle possède un ensemble de permissions (tableau JSON).
 */
@Entity({ name: 'role' })
@Index('IDX_role_tenant', ['tenant_id'])
@Index('UQ_role_tenant_name', ['tenant_id', 'name'], { unique: true })
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  tenant_id: string;

  /** Nom du rôle, ex: "Superviseur", "Agent", "Lecture seule" */
  @Column({ type: 'varchar', length: 60, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  /** Liste des permissions accordées */
  @Column({ type: 'json', nullable: false, default: '[]' })
  permissions: Permission[];

  /** Rôle système non supprimable (ex: admin par défaut) */
  @Column({ type: 'boolean', default: false })
  is_system: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
