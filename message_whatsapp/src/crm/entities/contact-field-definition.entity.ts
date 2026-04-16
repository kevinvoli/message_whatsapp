import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum FieldType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  BOOLEAN = 'boolean',
  SELECT = 'select',
  MULTISELECT = 'multiselect',
}

/**
 * P5.1 — Définition d'un champ CRM personnalisé au niveau tenant.
 * Le schéma est défini par l'admin et s'applique à tous les contacts du tenant.
 */
@Entity({ name: 'contact_field_definition' })
@Index('IDX_cfd_tenant', ['tenant_id'])
@Index('UQ_cfd_tenant_key', ['tenant_id', 'field_key'], { unique: true })
export class ContactFieldDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  tenant_id: string;

  /** Libellé affiché, ex: "Numéro client" */
  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  /** Clé technique unique, ex: "numero_client" */
  @Column({ type: 'varchar', length: 50, nullable: false })
  field_key: string;

  @Column({ type: 'enum', enum: FieldType, default: FieldType.TEXT })
  field_type: FieldType;

  /**
   * Options pour select/multiselect.
   * Ex: ["Bronze", "Silver", "Gold"]
   */
  @Column({ type: 'json', nullable: true })
  options: string[] | null;

  @Column({ type: 'boolean', default: false })
  required: boolean;

  /** Ordre d'affichage dans le formulaire contact */
  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
