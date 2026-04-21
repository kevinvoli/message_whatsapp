import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AiProviderType = 'anthropic' | 'openai' | 'ollama' | 'custom';

@Entity({ name: 'ai_provider' })
export class AiProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nom lisible, ex: "Claude Haiku — FlowBot", "GPT-4o — Qualification" */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  provider_type: AiProviderType;

  /** Identifiant du modèle, ex: "claude-haiku-4-5-20251001", "gpt-4o" */
  @Column({ type: 'varchar', length: 100 })
  model: string;

  /** Clé API chiffrée / stockée en clair selon la politique déploiement */
  @Column({ type: 'varchar', length: 500, nullable: true })
  api_key: string | null;

  /** URL de base de l'API, null = URL par défaut du provider */
  @Column({ type: 'varchar', length: 500, nullable: true })
  api_url: string | null;

  /** Timeout en ms pour les requêtes vers ce provider */
  @Column({ type: 'int', default: 30000 })
  timeout_ms: number;

  /** Si false, ce moteur n'est pas sélectionnable */
  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
