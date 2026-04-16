import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * P3.1 — Réponses prédéfinies (Canned Responses)
 *
 * Une réponse prédéfinie appartient à un poste (ou est globale si poste_id = null).
 * Elle est sélectionnable via un shortcode (ex: "/bonjour") dans l'interface agent.
 */
@Entity({ name: 'canned_response' })
@Index('IDX_canned_tenant_poste', ['tenant_id', 'poste_id'])
@Index('IDX_canned_shortcode', ['tenant_id', 'shortcode'])
export class CannedResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  tenant_id: string;

  /** null = disponible pour tous les postes du tenant */
  @Column({ type: 'varchar', length: 100, nullable: true })
  poste_id: string | null;

  /** Déclencheur court, ex: "bonjour", "merci", "horaires" */
  @Column({ type: 'varchar', length: 80, nullable: false })
  shortcode: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  title: string;

  @Column({ type: 'text', nullable: false })
  body: string;

  /** Catégorie libre (ex: "accueil", "support", "commercial") */
  @Column({ type: 'varchar', length: 80, nullable: true })
  category: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
