import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('admin_audit_log')
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'admin_id' })
  adminId: string;

  @Column()
  action: string;

  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  @Column({ name: 'target_id', nullable: true, type: 'varchar' })
  targetId: string | null;

  @Column({ name: 'target_entity' })
  targetEntity: string;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
