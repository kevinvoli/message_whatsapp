import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('dispatch_settings')
export class DispatchSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'no_reply_reinject_interval_minutes',
    type: 'int',
    default: 5,
  })
  no_reply_reinject_interval_minutes: number;

  @Column({
    name: 'read_only_check_interval_minutes',
    type: 'int',
    default: 10,
  })
  read_only_check_interval_minutes: number;

  @Column({
    name: 'offline_reinject_cron',
    type: 'varchar',
    length: 100,
    default: '0 9 * * *',
  })
  offline_reinject_cron: string;

  @Column({
    name: 'dispatch_mode',
    type: 'varchar',
    length: 20,
    default: 'LEAST_LOADED',
  })
  dispatch_mode: 'LEAST_LOADED' | 'ROUND_ROBIN';

  /** Nombre de messages commerciaux autorisés globalement avant lecture seule (0 = désactivé, 1 = défaut) */
  @Column({ name: 'read_only_max_messages', type: 'int', default: 1 })
  readOnlyMaxMessages: number;

  @Column({ name: 'max_read_messages_per_minute', type: 'int', default: 1 })
  maxReadMessagesPerMinute: number;

  @Column({ name: 'idle_disconnect_enabled', type: 'boolean', default: true })
  idleDisconnectEnabled: boolean;

  @Column({ name: 'idle_disconnect_minutes', type: 'int', default: 15 })
  idleDisconnectMinutes: number;

  @Column({ name: 'read_cooldown_seconds', type: 'int', default: 120 })
  readCooldownSeconds: number;

  @Column({ name: 'idle_warning_seconds', type: 'int', default: 10 })
  idleWarningSeconds: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
