import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TemplateStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'
  | 'IN_APPEAL'
  | 'FLAGGED'
  | 'DELETED';

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

@Entity({ name: 'whatsapp_template' })
@Index('IDX_template_tenant', ['tenantId'])
@Index('IDX_template_status', ['status'])
export class WhatsappTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 36, nullable: true })
  tenantId: string | null;

  @Column({ name: 'channel_id', type: 'varchar', length: 100, nullable: true })
  channelId: string | null;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'meta_template_id', type: 'varchar', length: 100, nullable: true })
  metaTemplateId: string | null;

  @Column({ name: 'category', type: 'varchar', length: 50 })
  category: TemplateCategory;

  @Column({ name: 'language', type: 'varchar', length: 10, default: 'fr' })
  language: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status: TemplateStatus;

  @Column({ name: 'header_type', type: 'varchar', length: 50, nullable: true })
  headerType: string | null;

  @Column({ name: 'header_content', type: 'text', nullable: true })
  headerContent: string | null;

  @Column({ name: 'body_text', type: 'text' })
  bodyText: string;

  @Column({ name: 'footer_text', type: 'varchar', length: 255, nullable: true })
  footerText: string | null;

  @Column({ name: 'buttons', type: 'json', nullable: true })
  buttons: Record<string, unknown>[] | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
