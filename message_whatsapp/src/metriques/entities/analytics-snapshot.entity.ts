import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('analytics_snapshot')
@Index('IDX_snapshot_scope_id_date', ['scope', 'scope_id', 'date_start'])
@Index('IDX_snapshot_computed_at', ['computed_at'])
export class AnalyticsSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ['global', 'poste', 'commercial', 'channel'] })
  scope: 'global' | 'poste' | 'commercial' | 'channel';

  @Column({ type: 'varchar', length: 100, nullable: true })
  scope_id: string | null;

  @Column({ type: 'date', nullable: true })
  date_start: Date | null;

  @Column({ type: 'date', nullable: true })
  date_end: Date | null;

  @Column({ type: 'json' })
  data: Record<string, unknown>;

  @CreateDateColumn({ name: 'computed_at' })
  computed_at: Date;

  @Column({ name: 'ttl_seconds', type: 'int', default: 600 })
  ttl_seconds: number;
}
