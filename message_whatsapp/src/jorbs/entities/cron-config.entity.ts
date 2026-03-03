import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CronScheduleType = 'interval' | 'cron' | 'event';

@Entity('cron_config')
export class CronConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Identifiant fonctionnel unique — ex: 'sla-checker' */
  @Column({ type: 'varchar', length: 100, unique: true })
  key: string;

  /** Nom affiché dans l'interface admin */
  @Column({ type: 'varchar', length: 200 })
  label: string;

  /** Description du rôle de ce CRON */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Activer ou désactiver ce CRON individuellement */
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** Type de planification */
  @Column({
    name: 'schedule_type',
    type: 'enum',
    enum: ['interval', 'cron', 'event'],
  })
  scheduleType: CronScheduleType;

  /** Intervalle en minutes (schedule_type = 'interval') */
  @Column({ name: 'interval_minutes', type: 'int', nullable: true })
  intervalMinutes: number | null;

  /** Expression cron 5 ou 6 champs (schedule_type = 'cron') */
  @Column({ name: 'cron_expression', type: 'varchar', length: 100, nullable: true })
  cronExpression: string | null;

  // ──────────────────── Champs spécifiques webhook-purge ────────────────────

  /** Durée de rétention en jours des événements webhook (key = 'webhook-purge') */
  @Column({ name: 'ttl_days', type: 'int', nullable: true })
  ttlDays: number | null;

  // ──────────────────── Champs spécifiques auto-message ────────────────────

  /** Délai minimum avant envoi d'un message auto, en secondes (key = 'auto-message') */
  @Column({ name: 'delay_min_seconds', type: 'int', nullable: true })
  delayMinSeconds: number | null;

  /** Délai maximum avant envoi d'un message auto, en secondes (key = 'auto-message') */
  @Column({ name: 'delay_max_seconds', type: 'int', nullable: true })
  delayMaxSeconds: number | null;

  /** Nombre maximum d'étapes auto-message avant passage en read_only (key = 'auto-message') */
  @Column({ name: 'max_steps', type: 'int', nullable: true })
  maxSteps: number | null;

  // ─────────────────────────────── Monitoring ──────────────────────────────

  /** Date/heure de la dernière exécution réussie */
  @Column({ name: 'last_run_at', type: 'datetime', nullable: true })
  lastRunAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
