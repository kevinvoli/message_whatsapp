import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('commercial_planning_audit')
@Index('IDX_planning_audit_commercial', ['commercialId'])
@Index('IDX_planning_audit_date', ['date'])
@Index('IDX_planning_audit_performed', ['performedAt'])
export class CommercialPlanningAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'planning_id', type: 'varchar', length: 36, nullable: true, default: null })
  planningId: string | null;

  @Column({ type: 'enum', enum: ['created', 'deleted'] })
  action: 'created' | 'deleted';

  @Column({ name: 'commercial_id', type: 'varchar', length: 36 })
  commercialId: string;

  @Column({ type: 'enum', enum: ['absence', 'exceptional'] })
  type: 'absence' | 'exceptional';

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  reason: string | null;

  @Column({ name: 'declared_by', type: 'varchar', length: 100, nullable: true, default: null })
  declaredBy: string | null;

  @Column({ name: 'performed_at', type: 'datetime', default: () => 'NOW()' })
  performedAt: Date;
}
