import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ActionTaskSource =
  | 'missed_call'
  | 'unanswered_message'
  | 'prospect_no_order'
  | 'cancelled_order'
  | 'inactive_client'
  | 'order_error';

export type ActionTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'skipped'
  | 'rescheduled';

@Entity('commercial_action_task')
@Index('IDX_cat_commercial_status', ['assignedCommercialId', 'status'])
@Index('IDX_cat_entity',            ['entityId', 'source'], { unique: true })
@Index('IDX_cat_due_at',            ['dueAt', 'status'])
export class CommercialActionTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source', type: 'varchar', length: 50 })
  source: ActionTaskSource;

  @Column({ name: 'priority', type: 'int', default: 50 })
  priority: number;

  @Column({ name: 'assigned_commercial_id', type: 'varchar', length: 36, nullable: true })
  assignedCommercialId: string | null;

  @Column({ name: 'assigned_poste_id', type: 'varchar', length: 36, nullable: true })
  assignedPosteId: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'pending' })
  status: ActionTaskStatus;

  /** ID de l'entité source (chat_id, contact_id, etc.) */
  @Column({ name: 'entity_id', type: 'varchar', length: 100 })
  entityId: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 200, nullable: true })
  contactName: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 50, nullable: true })
  contactPhone: string | null;

  @Column({ name: 'next_action', type: 'varchar', length: 100, nullable: true })
  nextAction: string | null;

  @Column({ name: 'due_at', type: 'timestamp', nullable: true })
  dueAt: Date | null;

  @Column({ name: 'last_attempt_at', type: 'timestamp', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number;

  /** Données du formulaire post-appel (JSON) */
  @Column({ name: 'form_data', type: 'json', nullable: true })
  formData: Record<string, unknown> | null;

  @Column({ name: 'audio_recording_url', type: 'varchar', length: 500, nullable: true })
  audioRecordingUrl: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
