import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AttendanceEventType = 'arrivee' | 'depart_pause' | 'retour_pause' | 'depart_maison';

@Entity('work_attendance')
@Index('IDX_wa_commercial_date', ['commercialId', 'workDate'])
export class WorkAttendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'commercial_id', type: 'varchar', length: 36 })
  commercialId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 20 })
  eventType: AttendanceEventType;

  @Column({ name: 'event_at', type: 'timestamp' })
  eventAt: Date;

  /** YYYY-MM-DD — pour regrouper par jour sans timezone */
  @Column({ name: 'work_date', type: 'char', length: 10 })
  workDate: string;

  /** Commentaire libre (exception superviseur) */
  @Column({ name: 'note', type: 'text', nullable: true })
  note: string | null;

  /** ID de qui a créé l'événement (commercial ou superviseur) */
  @Column({ name: 'created_by_id', type: 'varchar', length: 36, nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
