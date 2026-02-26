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

  /** Activation globale des messages automatiques (false par défaut = sécurité) */
  @Column({ name: 'auto_message_enabled', type: 'boolean', default: false })
  auto_message_enabled: boolean;

  /** Délai minimum en secondes avant l'envoi d'un message auto */
  @Column({ name: 'auto_message_delay_min_seconds', type: 'int', default: 20 })
  auto_message_delay_min_seconds: number;

  /** Délai maximum en secondes avant l'envoi d'un message auto */
  @Column({ name: 'auto_message_delay_max_seconds', type: 'int', default: 45 })
  auto_message_delay_max_seconds: number;

  /** Nombre max d'étapes de la séquence auto (au-delà : chat → read_only) */
  @Column({ name: 'auto_message_max_steps', type: 'int', default: 3 })
  auto_message_max_steps: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
