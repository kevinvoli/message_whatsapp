import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ComplaintCategory {
  COMMANDE_NON_LIVREE         = 'commande_non_livree',
  ERREUR_PRODUIT              = 'erreur_produit',
  CODE_EXPEDITION_NON_RECU    = 'code_expedition_non_recu',
  PLAINTE_LIVREUR             = 'plainte_livreur',
  PLAINTE_COMMERCIALE         = 'plainte_commerciale',
  PLAINTE_UTILISATION_PRODUIT = 'plainte_utilisation_produit',
}

export enum ComplaintPriority {
  NORMALE   = 'normale',
  HAUTE     = 'haute',
  CRITIQUE  = 'critique',
}

export enum ComplaintStatus {
  OUVERTE        = 'ouverte',
  ASSIGNEE       = 'assignee',
  EN_TRAITEMENT  = 'en_traitement',
  RESOLUE        = 'resolue',
  REJETEE        = 'rejetee',
}

@Entity('complaints')
@Index('IDX_complaint_status',     ['status'])
@Index('IDX_complaint_commercial', ['commercialId'])
@Index('IDX_complaint_priority',   ['priority'])
export class Complaint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contact_id', type: 'char', length: 36, nullable: true, default: null })
  contactId: string | null;

  @Column({ name: 'chat_id', type: 'varchar', length: 100, nullable: true, default: null })
  chatId: string | null;

  @Column({ name: 'commercial_id', type: 'char', length: 36, nullable: true, default: null })
  commercialId: string | null;

  @Column({ name: 'commercial_name', type: 'varchar', length: 100, nullable: true, default: null })
  commercialName: string | null;

  @Column({ name: 'order_id_db2', type: 'varchar', length: 100, nullable: true, default: null })
  orderIdDb2: string | null;

  @Column({ name: 'category', type: 'enum', enum: ComplaintCategory })
  category: ComplaintCategory;

  @Column({ name: 'priority', type: 'enum', enum: ComplaintPriority, default: ComplaintPriority.NORMALE })
  priority: ComplaintPriority;

  @Column({ name: 'status', type: 'enum', enum: ComplaintStatus, default: ComplaintStatus.OUVERTE })
  status: ComplaintStatus;

  @Column({ name: 'description', type: 'text' })
  description: string;

  @Column({ name: 'assigned_to', type: 'char', length: 36, nullable: true, default: null })
  assignedTo: string | null;

  @Column({ name: 'assigned_to_name', type: 'varchar', length: 100, nullable: true, default: null })
  assignedToName: string | null;

  @Column({ name: 'resolution_note', type: 'text', nullable: true, default: null })
  resolutionNote: string | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true, default: null })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
