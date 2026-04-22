import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum BatchStatus {
  PENDING  = 'pending',
  COMPLETE = 'complete',
}

@Entity('commercial_obligation_batch')
@Index('IDX_batch_poste_status', ['posteId', 'status'])
export class CommercialObligationBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'poste_id', type: 'char', length: 36 })
  posteId: string;

  /** Numéro séquentiel du batch pour ce poste (1, 2, 3…) */
  @Column({ name: 'batch_number', type: 'int', default: 1 })
  batchNumber: number;

  @Column({ name: 'status', type: 'enum', enum: BatchStatus, default: BatchStatus.PENDING })
  status: BatchStatus;

  // ── Compteurs d'appels par catégorie (objectif : 5 chacun) ───────────────
  @Column({ name: 'annulee_done', type: 'int', default: 0 })
  annuleeDone: number;

  @Column({ name: 'livree_done', type: 'int', default: 0 })
  livreeDone: number;

  @Column({ name: 'sans_commande_done', type: 'int', default: 0 })
  sansCommandeDone: number;

  // ── Contrôle qualité messages ─────────────────────────────────────────────
  /** true si le commercial a le dernier message sur toutes les conversations actives */
  @Column({ name: 'quality_check_passed', type: 'boolean', default: false })
  qualityCheckPassed: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true, default: null })
  completedAt: Date | null;
}
