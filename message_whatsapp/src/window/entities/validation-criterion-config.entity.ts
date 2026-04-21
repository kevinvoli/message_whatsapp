import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'validation_criterion_config' })
@Index('UQ_criterion_type', ['criterion_type'], { unique: true })
export class ValidationCriterionConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'criterion_type', type: 'varchar', length: 50 })
  criterion_type: string;

  @Column({ name: 'label', type: 'varchar', length: 100 })
  label: string;

  @Column({ name: 'is_required', type: 'boolean', default: true })
  is_required: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
