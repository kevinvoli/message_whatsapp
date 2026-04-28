import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum FollowUpType {
  RAPPEL = 'rappel',
  RELANCE_POST_CONVERSATION = 'relance_post_conversation',
  RELANCE_SANS_COMMANDE = 'relance_sans_commande',
  RELANCE_POST_ANNULATION = 'relance_post_annulation',
  RELANCE_FIDELISATION = 'relance_fidelisation',
  RELANCE_SANS_REPONSE = 'relance_sans_reponse',
}

export enum FollowUpStatus {
  PLANIFIEE = 'planifiee',
  EN_RETARD = 'en_retard',
  EFFECTUEE = 'effectuee',
  ANNULEE = 'annulee',
}

@Entity({ name: 'follow_up' })
@Index('IDX_follow_up_contact_id', ['contact_id'])
@Index('IDX_follow_up_commercial_id', ['commercial_id'])
@Index('IDX_follow_up_scheduled_at', ['scheduled_at'])
@Index('IDX_follow_up_status', ['status'])
export class FollowUp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contact_id', type: 'char', length: 36, nullable: true })
  contact_id?: string | null;

  @Column({ name: 'conversation_id', type: 'char', length: 36, nullable: true })
  conversation_id?: string | null;

  @Column({ name: 'commercial_id', type: 'char', length: 36, nullable: true })
  commercial_id?: string | null;

  @Column({ name: 'commercial_name', type: 'varchar', length: 200, nullable: true })
  commercial_name?: string | null;

  @Column({ name: 'type', type: 'enum', enum: FollowUpType })
  type: FollowUpType;

  @Column({ name: 'status', type: 'enum', enum: FollowUpStatus, default: FollowUpStatus.PLANIFIEE })
  status: FollowUpStatus;

  @Column({ name: 'scheduled_at', type: 'timestamp' })
  scheduled_at: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completed_at?: Date | null;

  @Column({ name: 'reminded_at', type: 'timestamp', nullable: true, default: null })
  reminded_at?: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true, default: null })
  cancelled_at?: Date | null;

  @Column({ name: 'cancelled_by', type: 'varchar', length: 200, nullable: true, default: null })
  cancelled_by?: string | null;

  @Column({ name: 'cancel_reason', type: 'varchar', length: 255, nullable: true, default: null })
  cancel_reason?: string | null;

  @Column({ name: 'result', type: 'varchar', length: 255, nullable: true })
  result?: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date | null;
}
