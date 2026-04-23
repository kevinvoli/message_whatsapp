import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('contact_phone')
@Index('IDX_contact_phone_contact_id', ['contactId'])
@Index('IDX_contact_phone_phone',      ['phone'])
export class ContactPhone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contact_id', type: 'char', length: 36 })
  contactId: string;

  @Column({ name: 'phone', type: 'varchar', length: 50 })
  phone: string;

  /** Ex: "WhatsApp", "Commande", "Domicile", "Bureau" */
  @Column({ name: 'label', type: 'varchar', length: 100, nullable: true, default: null })
  label: string | null;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
