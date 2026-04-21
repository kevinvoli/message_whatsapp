import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum CallStatus {
  ANSWERED  = 'answered',
  NO_ANSWER = 'no_answer',
  BUSY      = 'busy',
  REJECTED  = 'rejected',
  FAILED    = 'failed',
  VOICEMAIL = 'voicemail',
}

@Entity({ name: 'call_event' })
@Index('UQ_call_event_external_id', ['external_id'], { unique: true })
export class CallEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'external_id', type: 'varchar', length: 100 })
  external_id: string;

  @Column({ name: 'commercial_phone', type: 'varchar', length: 50 })
  commercial_phone: string;

  @Column({ name: 'client_phone', type: 'varchar', length: 50 })
  client_phone: string;

  @Column({ name: 'call_status', type: 'varchar', length: 30 })
  call_status: string;

  @Column({ name: 'duration_seconds', type: 'int', nullable: true })
  duration_seconds: number | null;

  @Column({ name: 'recording_url', type: 'varchar', length: 500, nullable: true })
  recording_url: string | null;

  @Column({ name: 'order_id', type: 'varchar', length: 100, nullable: true })
  order_id: string | null;

  @Column({ name: 'event_at', type: 'timestamp' })
  event_at: Date;

  @Column({ name: 'chat_id', type: 'varchar', length: 100, nullable: true })
  chat_id: string | null;

  @Column({ name: 'commercial_id', type: 'char', length: 36, nullable: true })
  commercial_id: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
