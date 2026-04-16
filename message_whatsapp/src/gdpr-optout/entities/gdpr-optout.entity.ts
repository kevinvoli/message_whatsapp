import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum OptOutReason {
  USER_REQUEST = 'user_request',
  ADMIN_REQUEST = 'admin_request',
  LEGAL_OBLIGATION = 'legal_obligation',
  UNSUBSCRIBE = 'unsubscribe',
}

/**
 * P3.5 — Opt-out RGPD/LGPD
 *
 * Enregistre qu'un numéro (phone_number) a demandé à ne plus être contacté
 * par le tenant. L'entrée est immuable (pas de softDelete) : piste d'audit légale.
 *
 * Effet côté pipeline : InboundMessageService vérifie isOptedOut() avant
 * de traiter le message — si opt-out actif, le message est ignoré silencieusement.
 */
@Entity({ name: 'gdpr_optout' })
@Index('IDX_optout_tenant_phone', ['tenant_id', 'phone_number'])
@Index('UQ_optout_tenant_phone', ['tenant_id', 'phone_number'], { unique: true })
export class GdprOptout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  tenant_id: string;

  /** Numéro E.164, ex: "+33612345678" ou chat_id WhatsApp "33612345678@s.whatsapp.net" */
  @Column({ type: 'varchar', length: 100, nullable: false })
  phone_number: string;

  @Column({
    type: 'enum',
    enum: OptOutReason,
    default: OptOutReason.USER_REQUEST,
  })
  reason: OptOutReason;

  /** Commentaire admin optionnel */
  @Column({ type: 'varchar', length: 255, nullable: true })
  notes: string | null;

  /** Qui a enregistré l'opt-out (agent_id ou "system") */
  @Column({ type: 'varchar', length: 100, nullable: true })
  registered_by: string | null;

  @CreateDateColumn({ name: 'opted_out_at' })
  optedOutAt: Date;

  /** Si non null, l'opt-out est levé (droit de retractation) */
  @Column({ type: 'timestamp', nullable: true })
  revoked_at: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  revoked_by: string | null;
}
