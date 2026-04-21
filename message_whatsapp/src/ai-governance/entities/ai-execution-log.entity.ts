import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'ai_execution_log' })
@Index('IDX_ai_exec_module_time', ['module_name', 'createdAt'])
@Index('IDX_ai_exec_triggered_by', ['triggered_by', 'createdAt'])
export class AiExecutionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  module_name: string;

  /** Scénario ou action précise (ex: 'suggestReplies', 'rewriteText:correct') */
  @Column({ type: 'varchar', length: 100, nullable: true })
  scenario: string | null;

  /** ID du commercial déclencheur, 'system' pour les automatisations */
  @Column({ type: 'varchar', length: 100, nullable: true })
  triggered_by: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  chat_id: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  channel_id: string | null;

  @Column({ default: true })
  success: boolean;

  /** Durée de l'appel IA en millisecondes */
  @Column({ default: 0 })
  latency_ms: number;

  /** true si on a utilisé le texte de fallback au lieu de l'IA */
  @Column({ default: false })
  fallback_used: boolean;

  @Column({ default: false })
  human_validation_used: boolean;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  /** Tokens consommés si le provider les expose */
  @Column({ type: 'int', nullable: true })
  tokens_used: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
