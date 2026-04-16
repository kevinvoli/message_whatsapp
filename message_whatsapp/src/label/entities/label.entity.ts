import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChatLabelAssignment } from './chat-label-assignment.entity';

/**
 * P3.3 — Définition d'un label au niveau du tenant.
 * Un label est créé par un admin et peut être assigné à n'importe quelle
 * conversation du tenant. Un label peut être restreint à un poste (poste_id).
 */
@Entity({ name: 'label' })
@Index('IDX_label_tenant', ['tenant_id'])
@Index('UQ_label_tenant_name', ['tenant_id', 'name'], { unique: true })
export class Label {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  tenant_id: string;

  @Column({ type: 'varchar', length: 80, nullable: false })
  name: string;

  /** Couleur hex ou nom CSS, ex: "#FF5733" */
  @Column({ type: 'varchar', length: 32, nullable: false, default: '#6B7280' })
  color: string;

  /** Description courte affichée en tooltip */
  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @OneToMany(() => ChatLabelAssignment, (a) => a.label)
  assignments: ChatLabelAssignment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
