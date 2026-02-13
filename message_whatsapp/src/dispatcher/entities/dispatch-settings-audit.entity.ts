import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('dispatch_settings_audit')
export class DispatchSettingsAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'settings_id', type: 'char', length: 36 })
  settings_id: string;

  @Column({ name: 'payload', type: 'longtext' })
  payload: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
