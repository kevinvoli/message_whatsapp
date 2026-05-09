import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('call_event_unresolved')
export class CallEventUnresolved {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'external_id', type: 'varchar', length: 100, unique: true })
  externalId: string;

  @Column({ name: 'local_number', type: 'varchar', length: 30, nullable: true })
  localNumber: string | null;

  @Column({ name: 'remote_number', type: 'varchar', length: 30, nullable: true })
  remoteNumber: string | null;

  @Column({ name: 'device_id', type: 'varchar', length: 100, nullable: true })
  deviceId: string | null;

  @Column({ name: 'call_type', type: 'varchar', length: 20, nullable: true })
  callType: string | null;

  @Column({ name: 'duration_sec', type: 'int', nullable: true })
  durationSec: number | null;

  @Column({ name: 'event_at', type: 'datetime' })
  eventAt: Date;

  @Column({ name: 'reason', type: 'varchar', length: 200, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'datetime', nullable: true })
  resolvedAt: Date | null;
}
