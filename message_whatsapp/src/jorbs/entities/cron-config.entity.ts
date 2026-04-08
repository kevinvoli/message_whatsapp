import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CronScheduleType = 'interval' | 'cron' | 'event' | 'config';

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
    enum: ['interval', 'cron', 'event', 'config'],
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

  // ──────────── Champs spécifiques no-response-auto-message ────────────────

  /** Seuil sans réponse en minutes avant déclenchement (key = 'no-response-auto-message') */
  @Column({ name: 'no_response_threshold_minutes', type: 'int', nullable: true })
  noResponseThresholdMinutes: number | null;

  /** Seuil attente queue en minutes (key = 'queue-wait-auto-message') */
  @Column({ name: 'queue_wait_threshold_minutes', type: 'int', nullable: true })
  queueWaitThresholdMinutes: number | null;

  /** Seuil inactivité totale en minutes (key = 'inactivity-auto-message') */
  @Column({ name: 'inactivity_threshold_minutes', type: 'int', nullable: true })
  inactivityThresholdMinutes: number | null;

  /** Appliquer aux conversations read_only=true ? */
  @Column({ name: 'apply_to_read_only', type: 'boolean', nullable: true, default: false })
  applyToReadOnly: boolean | null;

  /** Appliquer aux conversations fermées ? */
  @Column({ name: 'apply_to_closed', type: 'boolean', nullable: true, default: false })
  applyToClosed: boolean | null;

  // ──────────── Plage horaire configurable (key = 'auto-message-master') ───

  /** Heure de début d'activité du job maître (0–23) */
  @Column({ name: 'active_hour_start', type: 'int', nullable: true, default: 5 })
  activeHourStart: number | null;

  /** Heure de fin d'activité du job maître (0–23) */
  @Column({ name: 'active_hour_end', type: 'int', nullable: true, default: 21 })
  activeHourEnd: number | null;

  // ─────────────────────────────── Monitoring ──────────────────────────────

  /** Date/heure de la dernière exécution réussie */
  @Column({ name: 'last_run_at', type: 'datetime', nullable: true })
  lastRunAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
