import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * P6.3 — Webhook sortant configuré par tenant.
 * Chaque webhook est déclenché pour une liste d'événements.
 */
@Entity({ name: 'outbound_webhook' })
@Index('IDX_owh_tenant', ['tenant_id'])
export class OutboundWebhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, nullable: false })
  tenant_id: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: false })
  url: string;

  /**
   * Liste des événements qui déclenchent ce webhook.
   * Ex: ["message.received", "conversation.closed", "sla.breach"]
   */
  @Column({ type: 'json', nullable: false, default: '[]' })
  events: string[];

  /** Secret HMAC-SHA256 pour signer le payload (optionnel) */
  @Column({ type: 'varchar', length: 200, nullable: true, select: false })
  secret: string | null;

  @Column({ type: 'int', default: 3 })
  max_retries: number;

  /** Délai initial de retry en secondes (exponentiel) */
  @Column({ type: 'int', default: 60 })
  retry_delay_seconds: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
