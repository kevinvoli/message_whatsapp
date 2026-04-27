import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Entité read-only mappant la table `users` de DB2 (base commandes GICOP).
 * Contient à la fois les clients et les commerciaux — distingués par `type`.
 * NE JAMAIS écrire dans cette table.
 *
 * Utilisée via DataSource.getRepository(GicopUser) sur ORDER_DB_DATA_SOURCE.
 *
 * Résolution des IDs :
 *   id (DB2) ↔ client_identity_mapping.external_id    (pour les clients)
 *   id (DB2) ↔ commercial_identity_mapping.external_id (pour les commerciaux)
 */
@Entity('users')
@Index('idx_giocop_user_type',  ['type'])
@Index('idx_giocop_user_phone', ['phone'])
export class GicopUser {
  @PrimaryColumn({ name: 'id', type: 'int' })
  id: number;

  /**
   * Type d'utilisateur.
   * Valeurs observées : 0 = commercial, 1 = client (à confirmer avec l'équipe DB2).
   */
  @Column({ name: 'type', type: 'int', default: 0 })
  type: number;

  /** Poste du commercial dans DB2 (utile pour validation croisée). */
  @Column({ name: 'id_poste', type: 'int', nullable: true })
  idPoste: number | null;

  /** Identifiant matériel du téléphone du commercial — même valeur que call_logs.device_id. */
  @Column({ name: 'device_id', type: 'varchar', length: 100, nullable: true })
  deviceId: string | null;

  @Column({ name: 'nom', type: 'varchar', length: 255, nullable: true })
  nom: string | null;

  @Column({ name: 'prenoms', type: 'varchar', length: 255, nullable: true })
  prenoms: string | null;

  /** Numéro SIM principal — même valeur que call_logs.local_number pour les commerciaux. */
  @Column({ name: 'phone', type: 'varchar', length: 255, nullable: true })
  phone: string | null;

  @Column({ name: 'phone2', type: 'varchar', length: 255, nullable: true })
  phone2: string | null;

  /** 1 = actif. */
  @Column({ name: 'statut', type: 'tinyint', default: 1 })
  statut: number;

  /** 1 = non supprimé logiquement. */
  @Column({ name: 'valid', type: 'tinyint', default: 1 })
  valid: number;
}

/** Type commercial dans la table users DB2. */
export const GIOCOP_USER_TYPE_COMMERCIAL = 0;

/** Type client dans la table users DB2. */
export const GIOCOP_USER_TYPE_CLIENT = 1;
