import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Mappe un contact interne (UUID) vers son identifiant entier dans l'ERP externe.
 * Stocke aussi le numéro de téléphone normalisé pour la résolution inverse.
 */
@Entity({ name: 'client_identity_mapping' })
@Index('UQ_cim_contact_id',  ['contact_id'],    { unique: true })
@Index('UQ_cim_external_id', ['external_id'],   { unique: true })
@Index('IDX_cim_phone',      ['phone_normalized'])
export class ClientIdentityMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contact_id', type: 'char', length: 36 })
  contact_id: string;

  @Column({ name: 'external_id', type: 'int' })
  external_id: number;

  @Column({ name: 'phone_normalized', type: 'varchar', length: 30, nullable: true })
  phone_normalized?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
