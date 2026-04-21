import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Mappe un commercial interne (UUID) vers son identifiant entier dans l'ERP externe.
 */
@Entity({ name: 'commercial_identity_mapping' })
@Index('UQ_coim_commercial_id', ['commercial_id'], { unique: true })
@Index('UQ_coim_external_id',   ['external_id'],   { unique: true })
export class CommercialIdentityMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'commercial_id', type: 'char', length: 36 })
  commercial_id: string;

  @Column({ name: 'external_id', type: 'int' })
  external_id: number;

  @Column({ name: 'commercial_name', type: 'varchar', length: 100, nullable: true })
  commercial_name?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
