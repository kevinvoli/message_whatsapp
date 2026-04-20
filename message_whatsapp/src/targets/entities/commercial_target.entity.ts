import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TargetPeriodType {
  Day = 'day',
  Week = 'week',
  Month = 'month',
  Quarter = 'quarter',
}

export enum TargetMetric {
  Conversations = 'conversations',
  Calls = 'calls',
  FollowUps = 'follow_ups',
  Orders = 'orders',
  Relances = 'relances',
}

@Entity({ name: 'commercial_target' })
@Index('IDX_target_commercial_id', ['commercial_id'])
@Index('IDX_target_period', ['period_type', 'period_start'])
@Index('UQ_target_commercial_period_metric', ['commercial_id', 'period_type', 'period_start', 'metric'], { unique: true })
export class CommercialTarget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'commercial_id', type: 'char', length: 36 })
  commercial_id: string;

  @Column({ name: 'commercial_name', type: 'varchar', length: 200, nullable: true })
  commercial_name?: string | null;

  @Column({ name: 'period_type', type: 'enum', enum: TargetPeriodType })
  period_type: TargetPeriodType;

  @Column({ name: 'period_start', type: 'date' })
  period_start: string;

  @Column({ name: 'metric', type: 'enum', enum: TargetMetric })
  metric: TargetMetric;

  @Column({ name: 'target_value', type: 'int' })
  target_value: number;

  @Column({ name: 'created_by', type: 'varchar', length: 200, nullable: true })
  created_by?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date | null;
}
