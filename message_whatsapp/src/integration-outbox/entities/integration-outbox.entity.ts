import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { createHash } from 'crypto';

export type OutboxEventType = 'REPORT_SUBMITTED';
export type OutboxStatus    = 'pending' | 'processing' | 'success' | 'failed';

@Entity('integration_outbox')
@Index('IDX_outbox_status_retry',  ['status', 'nextRetryAt'])
@Index('IDX_outbox_event_entity',  ['eventType', 'entityId'])
export class IntegrationOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType: OutboxEventType;

  @Column({ name: 'entity_id', type: 'varchar', length: 100 })
  entityId: string;

  @Column({ name: 'payload_json', type: 'text' })
  payloadJson: string;

  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash: string;

  @Column({ name: 'schema_version', type: 'smallint', default: 1 })
  schemaVersion: number;

  @Column({ name: 'status', type: 'enum', enum: ['pending', 'processing', 'success', 'failed'], default: 'pending' })
  status: OutboxStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number;

  @Column({ name: 'next_retry_at', type: 'timestamp', nullable: true })
  nextRetryAt: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  static computeHash(payload: object): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
