import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('client_dossier')
@Index('IDX_dossier_contact_id', ['contactId'], { unique: true })
export class ClientDossier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contact_id', type: 'char', length: 36 })
  contactId: string;

  // ── Identification ────────────────────────────────────────────────────────
  @Column({ name: 'full_name', type: 'varchar', length: 200, nullable: true, default: null })
  fullName: string | null;

  @Column({ name: 'ville', type: 'varchar', length: 100, nullable: true, default: null })
  ville: string | null;

  @Column({ name: 'commune', type: 'varchar', length: 100, nullable: true, default: null })
  commune: string | null;

  @Column({ name: 'quartier', type: 'varchar', length: 100, nullable: true, default: null })
  quartier: string | null;

  @Column({ name: 'other_phones', type: 'text', nullable: true })
  otherPhones: string | null;

  // ── Intérêt produit ───────────────────────────────────────────────────────
  @Column({ name: 'product_category', type: 'varchar', length: 200, nullable: true, default: null })
  productCategory: string | null;

  @Column({ name: 'client_need', type: 'text', nullable: true })
  clientNeed: string | null;

  @Column({ name: 'interest_score', type: 'tinyint', nullable: true, default: null })
  interestScore: number | null;

  @Column({ name: 'is_male_not_interested', type: 'boolean', default: false })
  isMaleNotInterested: boolean;

  // ── Suivi ─────────────────────────────────────────────────────────────────
  @Column({ name: 'follow_up_at', type: 'timestamp', nullable: true, default: null })
  followUpAt: Date | null;

  @Column({ name: 'next_action', type: 'varchar', length: 50, nullable: true, default: null })
  nextAction: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
