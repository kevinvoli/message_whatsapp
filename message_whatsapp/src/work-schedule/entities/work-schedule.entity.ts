import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

@Entity('work_schedule')
@Index('IDX_ws_commercial_id', ['commercialId'])
@Index('IDX_ws_group_id',      ['groupId'])
export class WorkSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'commercial_id', type: 'varchar', length: 36, nullable: true })
  commercialId: string | null;

  @Column({ name: 'group_id', type: 'varchar', length: 36, nullable: true })
  groupId: string | null;

  @Column({ name: 'group_name', type: 'varchar', length: 100, nullable: true })
  groupName: string | null;

  @Column({ name: 'day_of_week', type: 'varchar', length: 15 })
  dayOfWeek: DayOfWeek;

  /** Format HH:MM */
  @Column({ name: 'start_time', type: 'varchar', length: 5 })
  startTime: string;

  /** Format HH:MM */
  @Column({ name: 'end_time', type: 'varchar', length: 5 })
  endTime: string;

  /** Créneaux de pause au format JSON: [{start: "12:00", end: "13:00"}] */
  @Column({ name: 'break_slots', type: 'json', nullable: true })
  breakSlots: Array<{ start: string; end: string }> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
