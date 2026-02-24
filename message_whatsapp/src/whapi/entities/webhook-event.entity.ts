import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'webhook_event_log', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index(
  'UQ_webhook_event_log_tenant_provider_event_key',
  ['tenant_id', 'provider', 'event_key'],
  { unique: true },
)
@Index('IDX_webhook_event_log_tenant_id', ['tenant_id'])
export class WebhookEventLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: true })
  tenant_id?: string | null;

  @Column({ type: 'varchar', length: 32 })
  provider: string;

  @Column({ type: 'varchar', length: 191 })
  event_key: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  event_type?: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  direction?: string | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  provider_message_id?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  payload_hash?: string | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
