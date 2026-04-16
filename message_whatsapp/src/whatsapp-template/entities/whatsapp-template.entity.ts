import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TemplateCategory {
  MARKETING = 'MARKETING',
  UTILITY = 'UTILITY',
  AUTHENTICATION = 'AUTHENTICATION',
}

export enum TemplateStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PAUSED = 'PAUSED',
  DISABLED = 'DISABLED',
  IN_APPEAL = 'IN_APPEAL',
  FLAGGED = 'FLAGGED',
  DELETED = 'DELETED',
}

export enum TemplateHeaderType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}

/**
 * P4.2 — Template HSM WhatsApp Business.
 *
 * Représente un template pré-approuvé par Meta.
 * Utilisé pour : contacter un client après 24h, campagnes broadcast, notifications.
 */
@Entity({ name: 'whatsapp_template' })
@Index('IDX_tpl_tenant_status', ['tenant_id', 'status'])
@Index('IDX_tpl_meta_id', ['meta_template_id'])
@Index('UQ_tpl_tenant_name_lang', ['tenant_id', 'name', 'language'], { unique: true })
export class WhatsappTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  tenant_id: string;

  /** ID du channel Meta auquel appartient ce template */
  @Column({ type: 'varchar', length: 100, nullable: true })
  channel_id: string | null;

  @Column({ type: 'varchar', length: 512, nullable: false })
  name: string;

  @Column({ type: 'enum', enum: TemplateCategory, default: TemplateCategory.UTILITY })
  category: TemplateCategory;

  /** Code langue Meta, ex: 'fr', 'en_US', 'ar' */
  @Column({ type: 'varchar', length: 20, nullable: false, default: 'fr' })
  language: string;

  @Column({
    type: 'enum',
    enum: TemplateStatus,
    default: TemplateStatus.PENDING,
  })
  status: TemplateStatus;

  /** Motif du rejet Meta */
  @Column({ type: 'varchar', length: 512, nullable: true })
  rejected_reason: string | null;

  /** ID attribué par Meta après soumission */
  @Column({ type: 'varchar', length: 100, nullable: true })
  meta_template_id: string | null;

  @Column({ type: 'enum', enum: TemplateHeaderType, nullable: true })
  header_type: TemplateHeaderType | null;

  @Column({ type: 'text', nullable: true })
  header_content: string | null;

  @Column({ type: 'text', nullable: false })
  body_text: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  footer_text: string | null;

  /**
   * Définitions des variables du body, ex:
   * [{ "type": "text", "text": "{{1}}" }, ...]
   */
  @Column({ type: 'json', nullable: true })
  parameters: Record<string, unknown>[] | null;

  /**
   * Boutons CTA ou quick-reply, ex:
   * [{ "type": "QUICK_REPLY", "text": "Oui" }, ...]
   */
  @Column({ type: 'json', nullable: true })
  buttons: Record<string, unknown>[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
