import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Entité read-only mappant la table `call_logs` de DB2 (base commandes).
 * NE JAMAIS écrire dans cette table — source de vérité appartenant à la plateforme commande.
 *
 * Utilisée via DataSource.getRepository(OrderCallLog) sur la connexion ORDER_DB_DATA_SOURCE.
 */
@Entity('call_logs')
@Index('idx_device',    ['deviceId'])
@Index('idx_timestamp', ['callTimestamp'])
@Index('idx_call_type', ['callType'])
export class OrderCallLog {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 36 })
  id: string;

  /** Identifiant du dispositif (téléphone du commercial). */
  @Column({ name: 'device_id', type: 'varchar', length: 100 })
  deviceId: string;

  /**
   * Type d'appel. Valeurs attendues (à confirmer) : 'MISSED', 'INCOMING', 'OUTGOING', 'REJECTED'.
   * Utiliser ORDER_CALL_TYPE_MISSED pour les appels manqués.
   */
  @Column({ name: 'call_type', type: 'varchar', length: 20 })
  callType: string;

  /** Numéro local (SIM du commercial) — utilisé pour résoudre le poste dans DB1. */
  @Column({ name: 'local_number', type: 'varchar', length: 30, nullable: true })
  localNumber: string | null;

  /** Numéro distant (client) — utilisé pour résoudre le contact dans DB1. */
  @Column({ name: 'remote_number', type: 'varchar', length: 30 })
  remoteNumber: string;

  @Column({ name: 'remote_number_formatted', type: 'varchar', length: 50, nullable: true })
  remoteNumberFormatted: string | null;

  @Column({ name: 'contact_name', type: 'varchar', length: 150, nullable: true })
  contactName: string | null;

  /** Durée en secondes. */
  @Column({ name: 'duration', type: 'int', default: 0 })
  duration: number;

  @Column({ name: 'call_timestamp', type: 'datetime' })
  callTimestamp: Date;

  @Column({ name: 'country_code', type: 'varchar', length: 5, nullable: true })
  countryCode: string | null;

  @Column({ name: 'operator', type: 'varchar', length: 100, nullable: true })
  operator: string | null;

  @Column({ name: 'sim_slot', type: 'tinyint', nullable: true })
  simSlot: number | null;

  @Column({ name: 'received_at', type: 'datetime' })
  receivedAt: Date;
}

/** Appel manqué (reçu mais non décroché). */
export const ORDER_CALL_TYPE_MISSED   = 'missed';

/** Appel sortant (passé par le commercial) — seul type éligible aux obligations. */
export const ORDER_CALL_TYPE_OUTGOING = 'outgoing';

/** Durée minimale (secondes) pour qu'un appel sortant compte dans les obligations. */
export const ORDER_CALL_MIN_DURATION_SEC = 90;
