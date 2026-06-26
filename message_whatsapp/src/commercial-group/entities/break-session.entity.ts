import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('break_session')
@Index('UQ_break_session', ['commercialId', 'breakScheduleId', 'date'], { unique: true })
export class BreakSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'commercial_id', type: 'char', length: 36 })
  commercialId: string;

  @Column({ name: 'break_schedule_id', type: 'char', length: 36 })
  breakScheduleId: string;

  @Column({ name: 'date', type: 'date' })
  date: string;

  @Column({ name: 'taken_at', type: 'datetime', nullable: true })
  takenAt: Date | null;

  @Column({ name: 'status', type: 'enum', enum: ['taken', 'missed'], default: 'taken' })
  status: 'taken' | 'missed';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
