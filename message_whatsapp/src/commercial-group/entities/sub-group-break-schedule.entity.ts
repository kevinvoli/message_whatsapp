import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CommercialSubGroup } from './commercial-sub-group.entity';

@Entity('sub_group_break_schedule')
@Index('IDX_break_schedule_subgroup', ['subGroupId'])
export class SubGroupBreakSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sub_group_id', type: 'char', length: 36 })
  subGroupId: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'reminder_interval_minutes', type: 'int', default: 5 })
  reminderIntervalMinutes: number;

  @Column({ name: 'popup_message_text', type: 'varchar', length: 1000, nullable: true, default: null })
  popupMessageText: string | null;

  @Column({ name: 'popup_audio_asset_id', type: 'char', length: 36, nullable: true, default: null })
  popupAudioAssetId: string | null;

  @Column({ name: 'max_duration_minutes', type: 'int', default: 60 })
  maxDurationMinutes: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date | null;

  @ManyToOne(() => CommercialSubGroup, (s) => s.breakSchedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sub_group_id' })
  subGroup?: CommercialSubGroup;
}
