import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('group_schedule_day')
@Index('UQ_group_schedule_day', ['groupId', 'date'], { unique: true })
@Index('IDX_group_schedule_date', ['date'])
export class GroupScheduleDay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'group_id', type: 'char', length: 36 })
  groupId: string;

  @Column({ name: 'date', type: 'date' })
  date: string; // 'YYYY-MM-DD'

  @Column({ name: 'is_work_day', type: 'boolean', default: false })
  isWorkDay: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
