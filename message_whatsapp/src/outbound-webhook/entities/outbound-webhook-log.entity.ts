import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OutboundWebhook } from './outbound-webhook.entity';

export enum WebhookDeliveryStatus {
  PENDING   = 'pending',
  SUCCESS   = 'success',
  FAILED    = 'failed',
  RETRYING  = 'retrying',
}

@Entity({ name: 'outbound_webhook_log' })
@Index('IDX_owhl_webhook', ['webhook_id', 'createdAt'])
@Index('IDX_owhl_status', ['status'])
export class OutboundWebhookLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  webhook_id: string;

  @ManyToOne(() => OutboundWebhook, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'webhook_id' })
  webhook: OutboundWebhook;

  @Column({ type: 'varchar', length: 100, nullable: false })
  event: string;

  @Column({ type: 'json', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: WebhookDeliveryStatus, default: WebhookDeliveryStatus.PENDING })
  status: WebhookDeliveryStatus;

  @Column({ type: 'int', nullable: true })
  response_status: number | null;

  @Column({ type: 'text', nullable: true })
  response_body: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', default: 0 })
  attempt: number;

  @Column({ type: 'datetime', nullable: true })
  next_retry_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
