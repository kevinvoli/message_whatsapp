import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'webhook_event_log', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('UQ_webhook_event_log_event_key', ['event_key'], { unique: true })
export class WebhookEventLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  provider: string;

  @Column({ type: 'varchar', length: 191 })
  event_key: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  event_type?: string | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
