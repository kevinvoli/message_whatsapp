import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum CallTaskCategory {
  COMMANDE_ANNULEE      = 'commande_annulee',
  COMMANDE_AVEC_LIVRAISON = 'commande_avec_livraison',
  JAMAIS_COMMANDE       = 'jamais_commande',
}

export enum CallTaskStatus {
  PENDING = 'pending',
  DONE    = 'done',
}

@Entity('call_task')
@Index('IDX_call_task_batch_cat', ['batchId', 'category', 'status'])
@Index('IDX_call_task_poste', ['posteId', 'status'])
export class CallTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'batch_id', type: 'char', length: 36 })
  batchId: string;

  @Column({ name: 'poste_id', type: 'char', length: 36 })
  posteId: string;

  @Column({ name: 'category', type: 'enum', enum: CallTaskCategory })
  category: CallTaskCategory;

  @Column({ name: 'status', type: 'enum', enum: CallTaskStatus, default: CallTaskStatus.PENDING })
  status: CallTaskStatus;

  /** Téléphone du client appelé (renseigné à la validation) */
  @Column({ name: 'client_phone', type: 'varchar', length: 50, nullable: true, default: null })
  clientPhone: string | null;

  /** Identifiant externe de l'événement d'appel qui a validé la tâche */
  @Column({ name: 'call_event_id', type: 'varchar', length: 100, nullable: true, default: null })
  callEventId: string | null;

  @Column({ name: 'duration_seconds', type: 'int', nullable: true, default: null })
  durationSeconds: number | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true, default: null })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
