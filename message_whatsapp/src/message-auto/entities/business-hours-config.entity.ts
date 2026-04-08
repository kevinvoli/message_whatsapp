import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'business_hours_config', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('UQ_business_hours_day', ['dayOfWeek'], { unique: true })
export class BusinessHoursConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 0 = Dimanche, 1 = Lundi … 6 = Samedi */
  @Column({ name: 'day_of_week', type: 'tinyint', nullable: false })
  dayOfWeek: number;

  @Column({ name: 'open_hour', type: 'int', default: 8 })
  openHour: number;

  @Column({ name: 'open_minute', type: 'int', default: 0 })
  openMinute: number;

  @Column({ name: 'close_hour', type: 'int', default: 18 })
  closeHour: number;

  @Column({ name: 'close_minute', type: 'int', default: 0 })
  closeMinute: number;

  @Column({ name: 'is_open', type: 'boolean', default: true })
  isOpen: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
