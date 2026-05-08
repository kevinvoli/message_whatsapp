import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Entité read-only mappant `statuts_commandes` de DB2 (base commandes).
 * Trace l'historique des changements d'état de livraison de chaque commande.
 * NE JAMAIS écrire dans cette table — source de vérité appartenant à la plateforme commande.
 *
 * Codes `etat` connus (SELECT * FROM statuts_commandes GROUP BY etat) :
 *   1, 3, 5 → états livreur (prise en charge, en cours, livré)
 *   2, 4    → retour en stock (livreur n'a pas pu livrer)
 *   99      → retour commande (client refuse ou commande annulée après départ)
 */

/** Valeurs de `etat` indiquant un retour — livraison effective annulée après sortie de stock. */
export const ORDER_COMMAND_STATUS_ETAT_RETOUR: number[] = [2, 4, 99];

@Entity('statuts_commandes')
@Index('idx_status_cmd_lookup', ['idCommande', 'valid', 'dateEnreg'])
export class OrderCommandStatus {
  @PrimaryColumn({ name: 'id', type: 'int' })
  id: number;

  @Column({ name: 'id_commande', type: 'int' })
  idCommande: number;

  @Column({ name: 'type_user', type: 'varchar', length: 20, nullable: true, default: 'livreur' })
  typeUser: string | null;

  @Column({ name: 'id_user', type: 'int', nullable: true })
  idUser: number | null;

  /** Code état de la livraison (voir ORDER_COMMAND_STATUS_ETAT_RETOUR pour les cas de retour). */
  @Column({ name: 'etat', type: 'int' })
  etat: number;

  @Column({ name: 'action', type: 'varchar', length: 100, nullable: true })
  action: string | null;

  @Column({ name: 'date_enreg', type: 'datetime' })
  dateEnreg: Date;

  @Column({ name: 'statut', type: 'tinyint', default: 1 })
  statut: number;

  @Column({ name: 'valid', type: 'tinyint', default: 1 })
  valid: number;
}
