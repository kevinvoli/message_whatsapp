import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Entité read-only mappant la table `call_logs` de DB2 (base commandes).
 * NE JAMAIS écrire dans cette table — source de vérité appartenant à la plateforme commande.
 *
 * Utilisée via DataSource.getRepository(OrderCallLog) sur la connexion ORDER_DB_DATA_SOURCE.
 *
 * ── Colonnes manquantes à demander à l'équipe DB2 ──────────────────────────────
 *   id_commercial INT NULL  — FK vers le commercial DB2 (même id que dans order_commands).
 *                             Permet la résolution directe via commercial_identity_mapping
 *                             sans passer par local_number (fragile si SIM non remontée).
 *
 *   id_client     INT NULL  — FK vers le client DB2 (même id que dans order_commands).
 *                             Actuellement on résout via remote_number → Contact.phone
 *                             mais c'est fragile si le numéro est reformaté ou inconnu.
 *
 * Une fois ajoutées, décommenter les champs idCommercial et idClient ci-dessous
 * et activer les index correspondants.
 * ───────────────────────────────────────────────────────────────────────────────
 */
@Entity('call_logs')
@Index('idx_device',      ['deviceId'])
@Index('idx_timestamp',   ['callTimestamp'])
@Index('idx_call_type',   ['callType'])
@Index('idx_commercial',  ['idCommercial'])
@Index('idx_client',      ['idClient'])
export class OrderCallLog {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 36 })
  id: string;

  /**
   * FK commercial DB2 (users.id) — résolution directe via commercial_identity_mapping.
   * Plus fiable que local_number (qui peut être absent si la SIM ne remonte pas son numéro).
   */
  @Column({ name: 'id_commercial', type: 'int', nullable: true })
  idCommercial: number | null;

  /**
   * FK client DB2 (users.id) — résolution directe via client_identity_mapping.
   * Plus fiable que remote_number (qui peut être reformaté ou inconnu).
   */
  @Column({ name: 'id_client', type: 'int', nullable: true })
  idClient: number | null;

  /** Identifiant du dispositif (téléphone du commercial). */
  @Column({ name: 'device_id', type: 'varchar', length: 100 })
  deviceId: string;

  /**
   * Type d'appel. Valeurs attendues (à confirmer) : 'MISSED', 'INCOMING', 'OUTGOING', 'REJECTED'.
   * Utiliser ORDER_CALL_TYPE_MISSED pour les appels manqués.
   */
  @Column({ name: 'call_type', type: 'varchar', length: 20 })
  callType: string;

  /** Numéro local (SIM du commercial) — conservé comme fallback si id_commercial est null. */
  @Column({ name: 'local_number', type: 'varchar', length: 30, nullable: true })
  localNumber: string | null;

  /** Numéro distant (client) — conservé comme fallback si id_client est null. */
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
