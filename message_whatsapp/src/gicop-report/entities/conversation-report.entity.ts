import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum NextAction {
  RAPPELER       = 'rappeler',
  ENVOYER_DEVIS  = 'envoyer_devis',
  RELANCER       = 'relancer',
  FERMER         = 'fermer',
  ARCHIVER       = 'archiver',
}

@Entity('conversation_report')
@Index('IDX_report_chat_id', ['chatId'], { unique: true })
@Index('IDX_report_poste_id', ['posteId'])
export class ConversationReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 100 })
  chatId: string;

  @Column({ name: 'commercial_id', type: 'char', length: 36, nullable: true, default: null })
  commercialId: string | null;

  @Column({ name: 'poste_id', type: 'char', length: 36, nullable: true, default: null })
  posteId: string | null;

  // ─── Informations client ──────────────────────────────────────────────────
  @Column({ name: 'client_name', type: 'varchar', length: 200, nullable: true, default: null })
  clientName: string | null;

  @Column({ name: 'ville', type: 'varchar', length: 100, nullable: true, default: null })
  ville: string | null;

  @Column({ name: 'commune', type: 'varchar', length: 100, nullable: true, default: null })
  commune: string | null;

  @Column({ name: 'quartier', type: 'varchar', length: 100, nullable: true, default: null })
  quartier: string | null;

  @Column({ name: 'product_category', type: 'varchar', length: 200, nullable: true, default: null })
  productCategory: string | null;

  @Column({ name: 'other_phones', type: 'text', nullable: true })
  otherPhones: string | null;

  // ─── Besoin et intérêt ────────────────────────────────────────────────────
  @Column({ name: 'client_need', type: 'text', nullable: true })
  clientNeed: string | null;

  /** Score d'intérêt de 1 à 5 */
  @Column({ name: 'interest_score', type: 'tinyint', nullable: true, default: null })
  interestScore: number | null;

  /** true si l'interlocuteur est un homme qui n'est pas intéressé (à rattacher au vrai client) */
  @Column({ name: 'is_male_not_interested', type: 'boolean', default: false })
  isMaleNotInterested: boolean;

  // ─── Suivi ────────────────────────────────────────────────────────────────
  @Column({ name: 'follow_up_at', type: 'timestamp', nullable: true, default: null })
  followUpAt: Date | null;

  @Column({ name: 'next_action', type: 'enum', enum: NextAction, nullable: true, default: null })
  nextAction: NextAction | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  // ─── Champs legacy conservés (compatibilité) ──────────────────────────────
  @Column({ name: 'client_interest', type: 'varchar', length: 50, nullable: true, default: null })
  clientInterest: string | null;

  @Column({ name: 'has_order', type: 'tinyint', width: 1, nullable: true, default: null })
  hasOrder: boolean | null;

  @Column({ name: 'order_amount', type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  orderAmount: number | null;

  @Column({ name: 'next_action_at', type: 'timestamp', nullable: true, default: null })
  nextActionAt: Date | null;

  @Column({ name: 'objections', type: 'text', nullable: true })
  objections: string | null;

  // ─── État du rapport ──────────────────────────────────────────────────────
  @Column({ name: 'is_complete', type: 'boolean', default: false })
  isComplete: boolean;

  @Column({ name: 'is_validated', type: 'boolean', default: false })
  isValidated: boolean;

  @Column({ name: 'validated_at', type: 'timestamp', nullable: true, default: null })
  validatedAt: Date | null;

  @Column({ name: 'validated_by_id', type: 'char', length: 36, nullable: true, default: null })
  validatedById: string | null;

  // ─── Soumission vers la plateforme de gestion des commandes ───────────────
  @Column({
    name: 'submission_status',
    type: 'enum',
    enum: ['pending', 'sent', 'failed'],
    nullable: true,
    default: null,
  })
  submissionStatus: 'pending' | 'sent' | 'failed' | null;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true, default: null })
  submittedAt: Date | null;

  @Column({ name: 'submission_error', type: 'text', nullable: true })
  submissionError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
