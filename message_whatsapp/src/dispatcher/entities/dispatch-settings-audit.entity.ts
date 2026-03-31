import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('dispatch_settings_audit')
// pagination et filtre de dates dans getAudit()
@Index('IDX_audit_created_at',    ['createdAt'])
// filtre par settings_id
@Index('IDX_audit_settings_id',   ['settings_id'])
export class DispatchSettingsAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'settings_id', type: 'char', length: 36 })
  settings_id: string;

  @Column({ name: 'payload', type: 'longtext' })
  payload: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
