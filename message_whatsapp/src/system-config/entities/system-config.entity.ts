import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'system_configs' })
@Index('UQ_system_config_key', ['configKey'], { unique: true })
export class SystemConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'config_key', type: 'varchar', length: 100 })
  configKey: string;

  @Column({ name: 'config_value', type: 'text', nullable: true })
  configValue: string | null;

  @Column({ name: 'category', type: 'varchar', length: 50, default: 'general' })
  category: string;

  @Column({ name: 'label', type: 'varchar', length: 200, nullable: true })
  label: string | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_secret', type: 'boolean', default: false })
  isSecret: boolean;

  @Column({ name: 'is_readonly', type: 'boolean', default: false })
  isReadonly: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
