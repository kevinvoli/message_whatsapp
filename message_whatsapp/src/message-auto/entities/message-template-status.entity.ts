import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** Statut d'approbation d'un template HSM WhatsApp Business. */
@Entity({ name: 'message_template_status', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('UQ_template_name_language', ['templateName', 'language'], { unique: true })
export class MessageTemplateStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_name', type: 'varchar', length: 100 })
  templateName: string;

  @Column({ name: 'language', type: 'varchar', length: 20 })
  language: string;

  /** APPROVED | PAUSED | REJECTED */
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'APPROVED' })
  status: string;

  @Column({ name: 'quality_score', type: 'varchar', length: 20, nullable: true })
  qualityScore?: string | null;

  @Column({ name: 'last_checked_at', type: 'timestamp', nullable: true })
  lastCheckedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
