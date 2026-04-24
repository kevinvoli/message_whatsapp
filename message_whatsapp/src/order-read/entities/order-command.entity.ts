import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Entité read-only mappant la table `commandes` de DB2 (base commandes).
 * NE JAMAIS écrire dans cette table — source de vérité appartenant à la plateforme commande.
 */
@Entity('commandes')
@Index('idx_cmd_fast',      ['valid', 'statut', 'etat', 'dateEnreg'])
@Index('idx_cmd_valid_etat',['valid', 'etat'])
export class OrderCommand {
  @PrimaryColumn({ name: 'id', type: 'int' })
  id: number;

  /** FK vers la table clients DB2 → mappé via client_identity_mapping (DB1). */
  @Column({ name: 'id_client', type: 'int', nullable: true })
  idClient: number | null;

  /** FK vers la table commerciaux DB2 → mappé via commercial_identity_mapping (DB1). */
  @Column({ name: 'id_commercial', type: 'int', default: 0 })
  idCommercial: number;

  /** FK vers la table postes DB2. */
  @Column({ name: 'id_poste', type: 'int', nullable: true })
  idPoste: number | null;

  @Column({ name: 'numero_gicop', type: 'varchar', length: 255, nullable: true })
  numeroGicop: string | null;

  @Column({ name: 'reference', type: 'varchar', length: 50, nullable: true })
  reference: string | null;

  @Column({ name: 'payment_method', type: 'varchar', length: 50, nullable: true })
  paymentMethod: string | null;

  @Column({ name: 'date_livraison', type: 'datetime', nullable: true })
  dateLivraison: Date | null;

  @Column({ name: 'date_annulation', type: 'datetime', nullable: true })
  dateAnnulation: Date | null;

  @Column({ name: 'motif_annulation', type: 'varchar', length: 255, nullable: true })
  motifAnnulation: string | null;

  @Column({ name: 'date_enreg', type: 'datetime', nullable: true })
  dateEnreg: Date | null;

  @Column({ name: 'date_livree', type: 'datetime', nullable: true })
  dateLivree: Date | null;

  @Column({ name: 'etat', type: 'int', default: 0 })
  etat: number;

  /** 1 = commande vraiment annulée (flag explicite). */
  @Column({ name: 'true_cancel', type: 'tinyint', default: 0 })
  trueCancel: number;

  /** 1 = confirmée par le gestionnaire. */
  @Column({ name: 'is_order_confirmed', type: 'int', default: 0 })
  isOrderConfirmed: number;

  /** 1 = préparée. */
  @Column({ name: 'is_order_prepared', type: 'tinyint', default: 0 })
  isOrderPrepared: number;

  /** 0 = provisoire, ignoré pour les calculs. */
  @Column({ name: 'is_on_temp', type: 'int', default: 0 })
  isOnTemp: number;

  /** À rappeler : flag pour priorisation. */
  @Column({ name: 'arappeler', type: 'tinyint', default: 0 })
  aRappeler: number;

  @Column({ name: 'prospected', type: 'int', default: 0 })
  prospected: number;

  @Column({ name: 'date_prospected', type: 'datetime', nullable: true })
  dateProspected: Date | null;

  /** Statut de la commande (valeurs définies par la plateforme commande). */
  @Column({ name: 'statut', type: 'int', default: 1 })
  statut: number;

  /** 1 = commande valide (non supprimée logiquement). */
  @Column({ name: 'valid', type: 'int', default: 1 })
  valid: number;

  @Column({ name: 'remarque', type: 'mediumtext', nullable: true })
  remarque: string | null;

  @Column({ name: 'origine', type: 'varchar', length: 255, nullable: true })
  origine: string | null;
}
