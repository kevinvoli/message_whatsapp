import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('commercial_daily_performance')
@Index('IDX_cdp_commercial_date', ['commercialId', 'snapshotDate'], { unique: true })
@Index('IDX_cdp_date', ['snapshotDate'])
export class CommercialDailyPerformance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'commercial_id', type: 'varchar', length: 36 })
  commercialId: string;

  @Column({ name: 'commercial_name', type: 'varchar', length: 200 })
  commercialName: string;

  /** Date du snapshot (YYYY-MM-DD) */
  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate: string;

  @Column({ name: 'messages_sent', type: 'int', default: 0 })
  messagesSent: number;

  @Column({ name: 'conversations', type: 'int', default: 0 })
  conversations: number;

  @Column({ name: 'calls', type: 'int', default: 0 })
  calls: number;

  @Column({ name: 'follow_ups_done', type: 'int', default: 0 })
  followUpsDone: number;

  @Column({ name: 'reports_submitted', type: 'int', default: 0 })
  reportsSubmitted: number;

  @Column({ name: 'orders', type: 'int', default: 0 })
  orders: number;

  @Column({ name: 'score', type: 'int', default: 0 })
  score: number;

  @Column({ name: 'rank_global', type: 'int', nullable: true })
  rankGlobal: number | null;

  @Column({ name: 'computed_at', type: 'timestamp' })
  computedAt: Date;
}
