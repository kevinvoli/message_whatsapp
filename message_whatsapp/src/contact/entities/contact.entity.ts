import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
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

export enum CallStatus {
  À_APPeler = 'à_appeler',
  Appelé = 'appelé',
  Rappeler = 'rappeler',
  Non_Joignable = 'non_joignable',
}
export enum Priority {
  Haute = 'haute',
  Moyenne = 'moyenne',
  Basse = 'basse',
}

export enum ClientCategory {
  JAMAIS_COMMANDE = 'jamais_commande',
  COMMANDE_SANS_LIVRAISON = 'commande_sans_livraison',
  COMMANDE_AVEC_LIVRAISON = 'commande_avec_livraison',
  COMMANDE_ANNULEE = 'commande_annulee',
}

export enum CertificationStatus {
  NON_VERIFIE = 'non_verifie',
  EN_ATTENTE = 'en_attente',
  CERTIFIE = 'certifie',
  REJETE = 'rejete',
}

@Entity()
// phone : hot path — appelé sur chaque message entrant (findOrCreate)
@Index('IDX_contact_phone',              ['phone'])
// chat_id : JOIN dans findAllByPosteId (contact.chat_id = chat.chat_id)
@Index('IDX_contact_chat_id',           ['chat_id'])
// filtre temporel + soft-delete
@Index('IDX_contact_created_deleted',   ['createdAt', 'deletedAt'])
export class Contact {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ name: 'contact', type: 'varchar', length: 100, nullable: false })
  phone: string;

  @Column({
    name: 'chat_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  chat_id?: string;

  // Informations d'appel
  @Column({
    name: 'call_status',
    type: 'enum',
    enum: CallStatus,
    default: CallStatus.À_APPeler,
  })
  call_status: CallStatus;

  @Column({ name: 'last_call_date', type: 'timestamp', nullable: true })
  last_call_date?: Date;

  @Column({
    name: 'last_call_outcome',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  last_call_outcome?: string;

  @Column({ name: 'next_call_date', type: 'timestamp', nullable: true })
  next_call_date?: Date;
  @Column({ name: 'call_count', type: 'int', default: 0 })
  call_count: number;

  @Column({ name: 'call_notes', type: 'text', nullable: true })
  call_notes?: string;

  // Statistiques
  @Column({ name: 'total_messages', type: 'int', default: 0 })
  total_messages?: number;

  @Column({ name: 'last_message_date', type: 'timestamp', nullable: true })
  last_message_date?: Date;
  @Column({
    name: 'conversion_status',
    type: 'enum',
    enum: ['nouveau', 'prospect', 'client', 'perdu'],
    default: 'nouveau',
  })
  conversion_status?: 'nouveau' | 'prospect' | 'client' | 'perdu';

  // Métadonnées
  @Column({ name: 'source', type: 'varchar', length: 100, nullable: true })
  source?: string;
  @Column({ name: 'priority', type: 'enum', enum: Priority, nullable: true })
  priority?: Priority;

  @OneToMany(() => WhatsappMessage, (message) => message.contact)
  messages: WhatsappMessage[];

  @Column({ default: true })
  is_active: boolean;

  // ─── P7 — Portefeuille et enrichissement client ──────────────────────────────
  @Column({ name: 'portfolio_owner_id', type: 'char', length: 36, nullable: true, default: null })
  portfolio_owner_id?: string | null;

  @Column({ name: 'order_client_id', type: 'int', nullable: true, default: null,
    comment: 'ID client dans la plateforme de gestion des commandes' })
  order_client_id?: number | null;

  @Column({ name: 'client_category', type: 'enum', enum: ClientCategory, nullable: true, default: null })
  client_category?: ClientCategory | null;

  @Column({ name: 'client_order_summary', type: 'json', nullable: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client_order_summary?: any;

  @Column({ name: 'certification_status', type: 'enum', enum: CertificationStatus, nullable: true, default: null })
  certification_status?: CertificationStatus | null;

  @Column({ name: 'certified_at', type: 'timestamp', nullable: true, default: null })
  certified_at?: Date | null;

  // ─── P8 — Parrainage ─────────────────────────────────────────────────────────
  @Column({ name: 'referral_code', type: 'varchar', length: 50, nullable: true, default: null })
  referral_code?: string | null;

  @Column({ name: 'referral_count', type: 'int', nullable: true, default: null })
  referral_count?: number | null;

  @Column({ name: 'referral_commission', type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  referral_commission?: number | null;

  @CreateDateColumn({
    name: 'createdAt',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'Timestamp when the trajet was created',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updatedAt',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    comment: 'Timestamp when the trajet was last updated',
  })
  updatedAt: Date;

  @DeleteDateColumn({
    name: 'deletedAt',
    type: 'timestamp',
    nullable: true,
    comment: 'Timestamp when the trajet was deleted',
  })
  deletedAt: Date | null;
}
