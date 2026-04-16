import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SlaMetric {
  /** Délai entre le premier message client et la première réponse agent */
  FIRST_RESPONSE = 'first_response',
  /** Délai entre la création de la conversation et sa clôture */
  RESOLUTION = 'resolution',
  /** Délai entre le dernier message client et une réponse (SLA de réengagement) */
  REENGAGEMENT = 'reengagement',
}

export enum SlaSeverity {
  WARNING = 'warning',
  BREACH = 'breach',
}

/**
 * P5.3 — Règle SLA configurable par tenant.
 * Une règle définit un seuil (en secondes) pour une métrique donnée.
 * Si la métrique dépasse le threshold, une alerte est émise avec la sévérité configurée.
 */
@Entity({ name: 'sla_rule' })
@Index('IDX_sla_tenant', ['tenant_id'])
@Index('IDX_sla_tenant_metric', ['tenant_id', 'metric'], { unique: true })
export class SlaRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  tenant_id: string;

  /** Libellé descriptif, ex: "SLA réponse initiale" */
  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ type: 'enum', enum: SlaMetric })
  metric: SlaMetric;

  /** Seuil en secondes, ex: 3600 pour 1 heure */
  @Column({ type: 'int', unsigned: true, nullable: false })
  threshold_seconds: number;

  @Column({ type: 'enum', enum: SlaSeverity, default: SlaSeverity.WARNING })
  severity: SlaSeverity;

  /** Si true, envoie une alerte admin via SystemAlertService */
  @Column({ type: 'boolean', default: true })
  notify_admin: boolean;

  /** Si false, la règle est ignorée */
  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
