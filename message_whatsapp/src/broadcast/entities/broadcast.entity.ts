import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BroadcastStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

/**
 * P4.3 — Campagne de broadcast HSM.
 *
 * Envoi massif d'un template HSM à une liste de destinataires.
 * Rate-limited : max 1000 envois/min par numéro (contrainte Meta).
 */
@Entity({ name: 'whatsapp_broadcast' })
@Index('IDX_broadcast_tenant_status', ['tenant_id', 'status'])
@Index('IDX_broadcast_scheduled', ['scheduled_at'])
export class WhatsappBroadcast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  tenant_id: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  name: string;

  /** FK vers whatsapp_template.id */
  @Column({ type: 'char', length: 36, nullable: false })
  template_id: string;

  /** FK vers whapi_channels.channel_id */
  @Column({ type: 'varchar', length: 100, nullable: false })
  channel_id: string;

  @Column({ type: 'enum', enum: BroadcastStatus, default: BroadcastStatus.DRAFT })
  status: BroadcastStatus;

  @Column({ type: 'timestamp', nullable: true })
  scheduled_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  started_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'int', default: 0 })
  total_count: number;

  @Column({ type: 'int', default: 0 })
  sent_count: number;

  @Column({ type: 'int', default: 0 })
  delivered_count: number;

  @Column({ type: 'int', default: 0 })
  read_count: number;

  @Column({ type: 'int', default: 0 })
  failed_count: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  created_by: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
