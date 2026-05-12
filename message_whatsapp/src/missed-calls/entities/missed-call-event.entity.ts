import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MissedCallEventStatus =
  | 'pending'
  | 'assigned'
  | 'called_back'
  | 'escalated'
  | 'closed';

@Entity('missed_call_event')
@Index('IDX_mce_client_phone_status', ['clientPhone', 'status', 'occurredAt'])
@Index('IDX_mce_poste_status', ['posteId', 'status'])
@Index('IDX_mce_commercial_status', ['commercialId', 'status'])
export class MissedCallEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source', type: 'enum', enum: ['whatsapp', 'db2'] })
  source: 'whatsapp' | 'db2';

  @Column({ name: 'external_id', type: 'varchar', length: 100, unique: true })
  externalId: string;

  @Column({ name: 'occurred_at', type: 'timestamp' })
  occurredAt: Date;

  @Column({ name: 'client_phone', type: 'varchar', length: 50 })
  clientPhone: string;

  @Column({ name: 'client_name', type: 'varchar', length: 200, nullable: true })
  clientName: string | null;

  @Column({ name: 'poste_id', type: 'varchar', length: 36, nullable: true })
  posteId: string | null;

  @Column({ name: 'commercial_id', type: 'varchar', length: 36, nullable: true })
  commercialId: string | null;

  @Column({ name: 'device_id', type: 'varchar', length: 100, nullable: true })
  deviceId: string | null;

  @Column({ name: 'callback_task_id', type: 'varchar', length: 36, nullable: true })
  callbackTaskId: string | null;

  @Column({ name: 'callback_done_at', type: 'timestamp', nullable: true })
  callbackDoneAt: Date | null;

  @Column({ name: 'callback_call_event_id', type: 'varchar', length: 100, nullable: true })
  callbackCallEventId: string | null;

  @Column({ name: 'callback_duration_seconds', type: 'int', nullable: true })
  callbackDurationSeconds: number | null;

  @Column({ name: 'handling_delay_seconds', type: 'int', nullable: true })
  handlingDelaySeconds: number | null;

  @Column({ name: 'sla_breached_at', type: 'timestamp', nullable: true })
  slaBreachedAt: Date | null;

  @Column({ name: 'escalated_at', type: 'timestamp', nullable: true })
  escalatedAt: Date | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['pending', 'assigned', 'called_back', 'escalated', 'closed'],
    default: 'pending',
  })
  status: MissedCallEventStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
