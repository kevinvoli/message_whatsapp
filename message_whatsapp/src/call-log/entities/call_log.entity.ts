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

  /** FK vers Contact (sans relation TypeORM pour éviter les chargements involontaires) */
  @Column({ name: 'contact_id', type: 'varchar', length: 36 })
  contact_id: string;

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

  @Column({ name: 'treated', type: 'tinyint', width: 1, default: 0 })
  treated: boolean;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
