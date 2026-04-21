import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AiModuleName =
  | 'suggestions'
  | 'rewrite'
  | 'summary'
  | 'qualification'
  | 'flowbot'
  | 'followup'
  | 'dossier'
  | 'quality';

@Entity({ name: 'ai_module_config' })
export class AiModuleConfig {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  module_name: string;

  @Column({ default: false })
  is_enabled: boolean;

  /** Texte envoyé si l'IA échoue ou est désactivée */
  @Column({ type: 'text', nullable: true })
  fallback_text: string | null;

  /** Validation humaine obligatoire avant d'agir */
  @Column({ default: false })
  requires_human_validation: boolean;

  /** Heure de début d'autorisation HH:MM (ex: "08:00"), null = pas de restriction */
  @Column({ type: 'varchar', length: 5, nullable: true })
  schedule_start: string | null;

  /** Heure de fin d'autorisation HH:MM (ex: "20:00"), null = pas de restriction */
  @Column({ type: 'varchar', length: 5, nullable: true })
  schedule_end: string | null;

  /** Rôles autorisés à déclencher ce module (null = tous) */
  @Column({ type: 'json', nullable: true })
  allowed_roles: string[] | null;

  /** IDs de canaux autorisés (null = tous) */
  @Column({ type: 'json', nullable: true })
  allowed_channels: string[] | null;

  /** Règles de sécurité métier (liste de sujets interdits, etc.) */
  @Column({ type: 'json', nullable: true })
  security_rules: Record<string, unknown> | null;

  /** ID du moteur IA dédié à ce module (null = utiliser le provider global system_config) */
  @Column({ type: 'char', length: 36, nullable: true })
  provider_id: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
