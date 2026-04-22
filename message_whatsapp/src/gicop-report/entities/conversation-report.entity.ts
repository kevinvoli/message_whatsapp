import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ClientInterest {
  TRES_INTERESSE = 'tres_interesse',
  INTERESSE      = 'interesse',
  PEU_INTERESSE  = 'peu_interesse',
  PAS_INTERESSE  = 'pas_interesse',
}

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

  // ─── Champs minimums requis ────────────────────────────────────────────────
  @Column({ name: 'client_interest', type: 'enum', enum: ClientInterest, nullable: true, default: null })
  clientInterest: ClientInterest | null;

  @Column({ name: 'has_order', type: 'tinyint', width: 1, nullable: true, default: null })
  hasOrder: boolean | null;

  @Column({ name: 'next_action', type: 'enum', enum: NextAction, nullable: true, default: null })
  nextAction: NextAction | null;

  // ─── Champs optionnels ────────────────────────────────────────────────────
  @Column({ name: 'order_amount', type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  orderAmount: number | null;

  @Column({ name: 'next_action_at', type: 'timestamp', nullable: true, default: null })
  nextActionAt: Date | null;

  @Column({ name: 'objections', type: 'text', nullable: true })
  objections: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  // ─── État du rapport ──────────────────────────────────────────────────────
  @Column({ name: 'is_complete', type: 'boolean', default: false })
  isComplete: boolean;

  @Column({ name: 'is_validated', type: 'boolean', default: false })
  isValidated: boolean;

  @Column({ name: 'validated_at', type: 'timestamp', nullable: true, default: null })
  validatedAt: Date | null;

  @Column({ name: 'validated_by_id', type: 'char', length: 36, nullable: true, default: null })
  validatedById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
