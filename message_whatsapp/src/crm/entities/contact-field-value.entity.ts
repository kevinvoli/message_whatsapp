import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContactFieldDefinition } from './contact-field-definition.entity';

/**
 * P5.1 — Valeur d'un champ CRM pour un contact donné.
 * Polymorphique : les colonnes de valeur correspondent à chaque FieldType.
 */
@Entity({ name: 'contact_field_value' })
@Index('IDX_cfv_contact', ['contact_id'])
@Index('IDX_cfv_field', ['field_id'])
@Index('UQ_cfv_contact_field', ['contact_id', 'field_id'], { unique: true })
export class ContactFieldValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  contact_id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  field_id: string;

  @ManyToOne(() => ContactFieldDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_id' })
  definition: ContactFieldDefinition;

  @Column({ type: 'text', nullable: true })
  value_text: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  value_number: number | null;

  @Column({ type: 'date', nullable: true })
  value_date: string | null;

  @Column({ type: 'tinyint', nullable: true })
  value_boolean: number | null;

  /** Pour select/multiselect (valeur(s) sélectionnée(s)) */
  @Column({ type: 'json', nullable: true })
  value_json: string[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
