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

  @Column({ name: 'no_reply_reinject_interval_minutes', type: 'int', default: 5 })
  no_reply_reinject_interval_minutes: number;


  @Column({ name: 'read_only_check_interval_minutes', type: 'int', default: 10 })
  read_only_check_interval_minutes: number;

  @Column({ name: 'offline_reinject_cron', type: 'varchar', length: 100, default: '0 9 * * *' })
  offline_reinject_cron: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
