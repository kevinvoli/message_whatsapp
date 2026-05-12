import { CallStatus } from 'src/contact/entities/contact.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';


export enum CallOutcome {
  Répondu = 'répondu',
  Messagerie = 'messagerie',
  PasDeRéponse = 'pas_de_réponse',
  Occupé = 'occupé',
}

@Entity()
// logs par contact (vue historique appels)
@Index('IDX_call_log_contact_id',    ['contact_id'])
// logs par commercial (tableau de bord commercial)
@Index('IDX_call_log_commercial_id', ['commercial_id'])
// tri chronologique
@Index('IDX_call_log_called_at',     ['called_at'])
export class CallLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK vers Contact (null si le numéro appelé n'existe pas comme contact WhatsApp) */
  @Column({ name: 'contact_id', type: 'varchar', length: 36, nullable: true, default: null })
  contact_id: string | null;

  /** Numéro de téléphone du client appelé (dénormalisé pour les cas sans contact) */
  @Column({ name: 'client_phone', type: 'varchar', length: 50, nullable: true, default: null })
  client_phone: string | null;

  /** Poste du commercial au moment de l'appel (dénormalisé) */
  @Index('IDX_call_log_poste_id')
  @Column({ name: 'poste_id', type: 'varchar', length: 36, nullable: true, default: null })
  poste_id: string | null;

  /** ID du commercial (sub du JWT) */
  @Column({ name: 'commercial_id', type: 'varchar', length: 36 })
  commercial_id: string;

  /** Nom dénormalisé pour éviter les joins */
  @Column({ name: 'commercial_name', type: 'varchar', length: 200 })
  commercial_name: string;

  @Column({ name: 'called_at', type: 'timestamp' })
  called_at: Date;

  @Column({ name: 'call_status', type: 'enum', enum: CallStatus })
  call_status: CallStatus;

  @Column({ name: 'outcome', type: 'enum', enum: CallOutcome, nullable: true })
  outcome?: CallOutcome | null;

  @Column({ name: 'duration_sec', type: 'int', nullable: true })
  duration_sec?: number | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null;

  /** Lien vers l'appel source dans call_event (idempotence automatique) */
  @Index('UQ_call_log_call_event_id', { unique: true })
  @Column({ name: 'call_event_external_id', type: 'varchar', length: 100, nullable: true, default: null })
  callEventExternalId: string | null;

  @Column({ name: 'treated', type: 'tinyint', width: 1, default: 0 })
  treated: boolean;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
