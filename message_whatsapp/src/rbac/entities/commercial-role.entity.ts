import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Role } from './role.entity';

/**
 * Association commercial ↔ rôle (un commercial peut avoir un seul rôle par tenant).
 */
@Entity({ name: 'commercial_role' })
@Index('IDX_comrole_commercial', ['commercial_id'])
@Index('IDX_comrole_role', ['role_id'])
@Index('UQ_comrole_commercial_tenant', ['commercial_id', 'tenant_id'], { unique: true })
export class CommercialRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  commercial_id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  tenant_id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  role_id: string;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date;
}
